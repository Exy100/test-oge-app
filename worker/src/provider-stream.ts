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

const nativeFrame = z.object({
  type: z.string(),
  index: z.number().int().nonnegative().optional(),
  content_block: z
    .object({ type: z.string(), text: z.string().optional() })
    .optional(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      stop_reason: z.string().nullable().optional(),
    })
    .optional(),
});

async function* anthropicTextDeltas(response: Response, scope: CallScope) {
  let started = false;
  let stopped = false;
  let nonempty = false;
  let length = 0;
  const blocks = new Map<number, string>();
  const seen = new Set<number>();
  function text(value: string) {
    length += value.length;
    if (length > 12_000) throw new TransportError('invalid-response');
    return value;
  }
  for await (const frame of frames(response, scope)) {
    if (frame.event === 'error') throw new TransportError('upstream');
    let item: z.infer<typeof nativeFrame>;
    try {
      item = nativeFrame.parse(JSON.parse(frame.data) as unknown);
    } catch {
      throw new TransportError('invalid-response');
    }
    if (frame.event && frame.event !== item.type)
      throw new TransportError('invalid-response');
    if (item.type === 'ping') continue;
    if (item.type === 'error') throw new TransportError('upstream');
    if (item.type === 'message_start') {
      if (started) throw new TransportError('invalid-response');
      started = true;
      continue;
    }
    if (!started) throw new TransportError('invalid-response');
    if (item.type === 'message_stop') {
      if (!stopped || !nonempty || blocks.size)
        throw new TransportError('invalid-response');
      return;
    }
    if (stopped) throw new TransportError('invalid-response');
    if (item.type === 'content_block_start') {
      const block = item.content_block;
      if (
        item.index === undefined ||
        seen.has(item.index) ||
        !block ||
        !['text', 'thinking', 'redacted_thinking'].includes(block.type)
      )
        throw new TransportError('invalid-response');
      seen.add(item.index);
      blocks.set(item.index, block.type);
      if (block.type === 'text') {
        if (typeof block.text !== 'string')
          throw new TransportError('invalid-response');
        if (block.text) {
          nonempty ||= Boolean(block.text.trim());
          yield text(block.text);
        }
      }
    } else if (item.type === 'content_block_delta') {
      const kind =
        item.index === undefined ? undefined : blocks.get(item.index);
      if (!kind || !item.delta) throw new TransportError('invalid-response');
      if (kind === 'text') {
        if (
          item.delta.type !== 'text_delta' ||
          typeof item.delta.text !== 'string'
        )
          throw new TransportError('invalid-response');
        if (item.delta.text) {
          nonempty ||= Boolean(item.delta.text.trim());
          yield text(item.delta.text);
        }
      } else if (
        !['thinking_delta', 'signature_delta'].includes(item.delta.type ?? '')
      )
        throw new TransportError('invalid-response');
    } else if (item.type === 'content_block_stop') {
      if (item.index === undefined || !blocks.delete(item.index))
        throw new TransportError('invalid-response');
    } else if (item.type === 'message_delta') {
      if (blocks.size || item.delta?.stop_reason !== 'end_turn')
        throw new TransportError('invalid-response');
      stopped = true;
    } else throw new TransportError('invalid-response');
  }
  throw new TransportError('invalid-response');
}

/** Forward text only: never expose provider diagnostics, model ids or usage. */
export function streamResponse(
  upstream: Response,
  scope: CallScope,
  native = false,
) {
  const iterator = native
    ? anthropicTextDeltas(upstream, scope)
    : textDeltas(upstream, scope);
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
