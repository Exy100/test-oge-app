import { z } from '../../core/zod';
import { browserStore } from '../../core/storage/browser';
import { hasAiConsent } from './consent';
import { summaryRequestSchema, type SummaryProvider } from './summary-contract';
import {
  FeedbackError,
  feedbackRequestSchema,
  type FeedbackProvider,
} from './contract';

const delta = z.strictObject({ delta: z.string().max(12000) });
const failure = z.object({ error: z.object({ code: z.string().max(100) }) });
function safeError(code: string): FeedbackError {
  if (code === 'rate-minute' || code === 'rate-day')
    return new FeedbackError('rate-limit');
  if (code === 'ai-disabled') return new FeedbackError('disabled');
  if (code === 'budget' || code === 'timeout') return new FeedbackError(code);
  return new FeedbackError('unavailable');
}
function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Остановлено', 'AbortError'),
      );
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (cause: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(cause instanceof Error ? cause : new FeedbackError('network'));
      },
    );
    if (signal.aborted) abort();
  });
}

/** Only our same-origin API is reachable; no provider key, model or prompt in the browser. */
export function createApiFeedbackProvider(
  transport: typeof fetch = fetch,
  consented: () => boolean = () => hasAiConsent(browserStore()),
): FeedbackProvider {
  const provider = createMarkdownProvider(
    '/api/ai/stream-feedback',
    feedbackRequestSchema,
    transport,
    consented,
  );
  return { streamFeedback: (input, signal) => provider.stream(input, signal) };
}
export function createApiSummaryProvider(
  transport: typeof fetch = fetch,
  consented: () => boolean = () =>
    hasAiConsent(browserStore(), 'variant-summary'),
): SummaryProvider {
  const provider = createMarkdownProvider(
    '/api/ai/variant-summary',
    summaryRequestSchema,
    transport,
    consented,
  );
  return { streamSummary: (input, signal) => provider.stream(input, signal) };
}
function createMarkdownProvider<T>(
  path: '/api/ai/stream-feedback' | '/api/ai/variant-summary',
  schema: z.ZodType<T>,
  transport: typeof fetch,
  consented: () => boolean,
) {
  return {
    async *stream(input: T, parent: AbortSignal) {
      parent.throwIfAborted();
      if (!consented()) throw new FeedbackError('consent');
      const parsed = schema.safeParse(input);
      if (!parsed.success) throw new FeedbackError('invalid-request');
      if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > 8192)
        throw new FeedbackError('invalid-request');
      const controller = new AbortController();
      const abort = () => {
        controller.abort(new DOMException('Остановлено', 'AbortError'));
      };
      parent.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => {
        controller.abort(new FeedbackError('timeout'));
      }, 30_000);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let done = false;
      try {
        const pending = transport(path, {
          method: 'POST',
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
          signal: controller.signal,
        });
        void pending.then(
          (response) => {
            if (controller.signal.aborted)
              void response.body?.cancel().catch(() => undefined);
          },
          () => undefined,
        );
        const response = await wait(pending, controller.signal);
        if (!response.body) throw new FeedbackError('invalid-response');
        reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let total = 0;
        let textLength = 0;
        let buffer = '';
        let event = '';
        let data: string[] = [];
        let frameLength = 0;
        let errorText = '';
        for (;;) {
          const chunk = await wait(reader.read(), controller.signal);
          total += chunk.value?.byteLength ?? 0;
          if (total > (response.ok ? 1_048_576 : 4096))
            throw new FeedbackError('invalid-response');
          let text: string;
          try {
            text = chunk.done
              ? decoder.decode()
              : decoder.decode(chunk.value, { stream: true });
          } catch {
            throw new FeedbackError('invalid-response');
          }
          if (!response.ok) {
            errorText += text;
            if (!chunk.done) continue;
            let rawError: unknown;
            try {
              rawError = JSON.parse(errorText) as unknown;
            } catch {
              rawError = null;
            }
            const parsedError = failure.safeParse(rawError);
            if (parsedError.success)
              throw safeError(parsedError.data.error.code);
            throw new FeedbackError(
              response.status === 429 ? 'rate-limit' : 'unavailable',
            );
          }
          if (
            response.headers
              .get('Content-Type')
              ?.split(';')[0]
              ?.trim()
              .toLowerCase() !== 'text/event-stream'
          )
            throw new FeedbackError('invalid-response');
          buffer += text;
          let output = '';
          for (;;) {
            const end = buffer.search(/[\r\n]/u);
            if (
              end === -1 ||
              (buffer[end] === '\r' && end === buffer.length - 1 && !chunk.done)
            )
              break;
            const line = buffer.slice(0, end);
            buffer = buffer.slice(
              end + (buffer.slice(end, end + 2) === '\r\n' ? 2 : 1),
            );
            frameLength += line.length;
            if (frameLength > 65536)
              throw new FeedbackError('invalid-response');
            if (line === '') {
              if (data.length) {
                const raw = data.join('\n');
                if (event === 'error') {
                  const problem = failure.safeParse(JSON.parse(raw) as unknown);
                  throw problem.success
                    ? safeError(problem.data.error.code)
                    : new FeedbackError('invalid-response');
                }
                if (event && event !== 'message')
                  throw new FeedbackError('invalid-response');
                if (raw === '[DONE]') {
                  if (textLength === 0)
                    throw new FeedbackError('invalid-response');
                  if (output) yield output;
                  done = true;
                  return;
                }
                const value = delta.parse(JSON.parse(raw) as unknown).delta;
                textLength += value.length;
                if (textLength > 12000)
                  throw new FeedbackError('invalid-response');
                output += value;
              }
              data = [];
              event = '';
              frameLength = 0;
            } else if (!line.startsWith(':')) {
              const colon = line.indexOf(':');
              const field = colon === -1 ? line : line.slice(0, colon);
              const content =
                colon === -1 ? '' : line.slice(colon + 1).replace(/^ /u, '');
              if (field === 'data') data.push(content);
              else if (field === 'event') event = content;
            }
          }
          // One render per received batch, including a burst of buffered deltas.
          if (output) yield output;
          if (buffer.length + frameLength > 65536 || chunk.done)
            throw new FeedbackError('invalid-response');
        }
      } catch (cause) {
        if (parent.aborted) throw new DOMException('Остановлено', 'AbortError');
        if (controller.signal.aborted) throw controller.signal.reason;
        if (cause instanceof FeedbackError) throw cause;
        throw new FeedbackError(
          cause instanceof TypeError ? 'network' : 'invalid-response',
        );
      } finally {
        if (!done)
          controller.abort(new DOMException('Остановлено', 'AbortError'));
        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        clearTimeout(timer);
        parent.removeEventListener('abort', abort);
      }
    },
  };
}
