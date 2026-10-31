import { z } from '../../core/zod';
import { FeedbackError } from './contract';

export function apiError(code: string): FeedbackError {
  if (code === 'rate-minute' || code === 'rate-day')
    return new FeedbackError('rate-limit');
  if (code === 'ai-disabled') return new FeedbackError('disabled');
  if (code === 'budget' || code === 'timeout') return new FeedbackError(code);
  return new FeedbackError('unavailable');
}

/** Bound the whole JSON response, including stalled fetch/read and late bodies. */
export async function apiJson(
  path: '/api/ai/health' | '/api/ai/part2-grade',
  input: unknown,
  parent: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new FeedbackError('timeout')),
    path.endsWith('/health') ? 5000 : 30_000,
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  function wait<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', cancel, { once: true });
      promise
        .then(resolve, reject)
        .finally(() => controller.signal.removeEventListener('abort', cancel));
      if (controller.signal.aborted) cancel();
    });
  }
  try {
    const pending = transport(path, {
      method: input === undefined ? 'GET' : 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      ...(input === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          }),
      signal: controller.signal,
    });
    void pending.then(
      (response) => {
        if (controller.signal.aborted)
          void response.body?.cancel().catch(() => undefined);
      },
      () => undefined,
    );
    const response = await wait(pending);
    if (
      !response.body ||
      response.headers
        .get('Content-Type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      throw new FeedbackError('invalid-response');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const chunk = await wait(reader.read());
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > (path.endsWith('/health') ? 1024 : 65_536))
        throw new FeedbackError('invalid-response');
      chunks.push(chunk.value);
    }
    parent.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!response.ok) {
      const error = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(value);
      throw error.success
        ? apiError(error.data.error.code)
        : new FeedbackError(
            response.status === 429 ? 'rate-limit' : 'unavailable',
          );
    }
    return value;
  } catch (cause) {
    if (parent.aborted) throw parent.reason;
    if (controller.signal.aborted) throw controller.signal.reason;
    if (cause instanceof FeedbackError) throw cause;
    throw new FeedbackError(
      cause instanceof TypeError ? 'network' : 'invalid-response',
    );
  } finally {
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
  }
}

export async function checkAiHealth(
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const value = z
    .strictObject({ enabled: z.boolean() })
    .safeParse(await apiJson('/api/ai/health', undefined, signal, transport));
  if (!value.success) throw new FeedbackError('unavailable');
  if (!value.data.enabled) throw new FeedbackError('disabled');
}
