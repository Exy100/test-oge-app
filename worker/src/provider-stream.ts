import { z } from '../../src/core/zod';
import {
  CallScope,
  discard,
  readBytes,
  safeFailure,
  TransportError,
} from './transport';

const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        index: z.literal(0).optional(),
        delta: z
          .object({ content: z.string().nullable().optional() })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .max(1),
});

async function* frames(response: Response, scope: CallScope) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data: string[] = [];
  let event = '';
  let frameLength = 0;
  function take(final: boolean) {
    const result: Array<{ data: string; event: string }> = [];
    for (;;) {
      const newline = /\r\n|\r|\n/u.exec(buffer);
      if (
        !newline ||
        (!final && newline[0] === '\r' && newline.index + 1 === buffer.length)
      )
        break;
      const line = buffer.slice(0, newline.index);
      buffer = buffer.slice(newline.index + newline[0].length);
      frameLength += line.length;
      if (frameLength > 65_536) throw new TransportError('invalid-response');
      if (!line) {
        if (data.length) result.push({ data: data.join('\n'), event });
        data = [];
        event = '';
        frameLength = 0;
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const key = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /u, '');
        if (key === 'data') data.push(value);
        if (key === 'event') event = value;
      }
    }
    if (buffer.length + frameLength > 65_536)
      throw new TransportError('invalid-response');
    return result;
  }
  try {
    for await (const bytes of readBytes(response, scope)) {
      buffer += decoder.decode(bytes, { stream: true });
      yield* take(false);
    }
    buffer += decoder.decode();
    yield* take(true);
  } catch (cause) {
    if (cause instanceof TransportError) throw cause;
    throw new TransportError('invalid-response');
  }
}

async function* textDeltas(response: Response, scope: CallScope) {
  let stopped = false;
  let nonempty = false;
  let length = 0;
  for await (const frame of frames(response, scope)) {
    if (frame.event === 'error') throw new TransportError('upstream');
    if (frame.data.trim() === '[DONE]') {
      if (!stopped || !nonempty) throw new TransportError('invalid-response');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(frame.data);
    } catch {
      throw new TransportError('invalid-response');
    }
    const parsed = chunkSchema.safeParse(raw);
    if (!parsed.success) throw new TransportError('invalid-response');
    const choice = parsed.data.choices[0];
    if (!choice) continue;
    const text = choice.delta?.content;
    if (text) {
      length += text.length;
      if (stopped || length > 12_000)
        throw new TransportError('invalid-response');
      if (text.trim()) nonempty = true;
      yield text;
    }
    if (choice.finish_reason) {
      if (choice.finish_reason !== 'stop')
        throw new TransportError('invalid-response');
      stopped = true;
    }
  }
  throw new TransportError('invalid-response');
}

/** Forward text only: never expose provider diagnostics, model ids or usage. */
export function streamResponse(upstream: Response, scope: CallScope) {
  const iterator = textDeltas(upstream, scope);
  const encoder = new TextEncoder();
  let ended = false;
  let abort: () => void;
  const close = () => {
    ended = true;
    scope.signal.removeEventListener('abort', abort);
    scope.close();
    void iterator.return().catch(() => undefined);
    if (!upstream.body?.locked) discard(upstream.body);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (ended) return;
        const error = safeFailure(scope.signal.reason);
        if (error.code !== 'cancelled')
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: { code: error.code, message: error.message } })}\n\n`,
            ),
          );
        controller.close();
        close();
      };
      scope.signal.addEventListener('abort', abort, { once: true });
      if (scope.signal.aborted) abort();
    },
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (ended) return;
        if (item.done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          close();
        } else
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ delta: item.value })}\n\n`,
            ),
          );
      } catch (cause) {
        if (ended) return;
        const error = safeFailure(cause);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: { code: error.code, message: error.message } })}\n\n`,
          ),
        );
        controller.close();
        close();
      }
    },
    cancel() {
      scope.signal.removeEventListener('abort', abort);
      scope.abort('cancelled');
      close();
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}
