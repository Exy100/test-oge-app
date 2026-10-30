import { afterEach, expect, test, vi } from 'vitest';
import { createApiFeedbackProvider } from '../../src/lib/ai/api-provider';
import {
  consumeFeedback,
  consumeCachedFeedback,
} from '../../src/lib/ai/feedback';
import { renderFeedback } from '../../src/lib/ai/render';
import {
  feedbackErrorMessage,
  FeedbackError,
  type FeedbackProvider,
} from '../../src/lib/ai/contract';
import { SessionCache } from '../../src/core/storage/cache';
import { LocalStore } from '../../src/core/storage/store';
import { grantAiConsent, hasAiConsent } from '../../src/lib/ai/consent';
import { PREFIX } from '../../src/core/storage/schemas';
import { xssContent } from '../fixtures/xss-content';

const request = {
  generatorId: 'numeral-sum-v2',
  seed: 'ai-client',
  answer: '1',
  reasoning: 'Мой черновик',
};
const raw =
  'data: {"delta":"### Итог\\nПолный разбор $2^3$."}\n\ndata: [DONE]\n\n';
const sse = (value = raw) =>
  new Response(value, { headers: { 'Content-Type': 'text/event-stream' } });
async function receive(
  transport: typeof fetch,
  input = request,
  signal = new AbortController().signal,
) {
  const html: string[] = [];
  await consumeFeedback(
    createApiFeedbackProvider(transport, () => true),
    input,
    signal,
    (value) => html.push(value),
  );
  return html;
}
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    port: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('legacy preference does not grant informed consent; grant, revoke and incompatible policy are distinct', () => {
  const { port } = memory();
  port.setItem(
    PREFIX + 'aiConsent',
    JSON.stringify({ version: 1, enabled: true }),
  );
  const store = new LocalStore(() => port);
  expect(hasAiConsent(store)).toBe(false);
  grantAiConsent(store);
  expect(hasAiConsent(new LocalStore(() => port))).toBe(true);
  store.write('aiConsent', { version: 1, enabled: false });
  expect(hasAiConsent(store)).toBe(false);
  port.setItem(
    PREFIX + 'aiConsent',
    JSON.stringify({ version: 1, enabled: true, policy: 'unknown-policy' }),
  );
  expect(hasAiConsent(new LocalStore(() => port))).toBe(false);
});
test('no consent, aborted signal and invalid input never start a network request', async () => {
  const transport = vi.fn<typeof fetch>();
  const provider = createApiFeedbackProvider(transport, () => false);
  await expect(
    provider
      .streamFeedback(request, new AbortController().signal)
      [Symbol.asyncIterator]()
      .next(),
  ).rejects.toMatchObject({ code: 'consent' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    receive(transport, request, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(
    receive(transport, { ...request, answer: 'x'.repeat(301) }),
  ).rejects.toMatchObject({ code: 'invalid-request' });
  expect(transport).not.toHaveBeenCalled();
});
test('same-origin POST contains only identity and student input; no cookie, key, model or redirect', async () => {
  const transport = vi.fn<typeof fetch>(() => Promise.resolve(sse()));
  const result = await receive(transport);
  expect(result.at(-1)).toContain('<math');
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0] ?? [];
  expect(url).toBe('/api/ai/stream-feedback');
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  if (typeof init?.body !== 'string') throw new Error('Expected JSON body');
  expect(JSON.parse(init.body)).toEqual(request);
});
test('UTF-8 split into single bytes and mixed CR/LF frames arrive incrementally', async () => {
  const bytes = new TextEncoder().encode(
    ':comment\r\nevent: message\r\ndata: {"delta":\r\ndata: "Привет"}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  let position = 0;
  const transport: typeof fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (position === bytes.length) controller.close();
            else controller.enqueue(bytes.slice(position, ++position));
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
  expect((await receive(transport)).at(-1)).toContain('Привет');
});
test('first delta appears before DONE and early consumer return cancels the transport', async () => {
  let signal: AbortSignal | null | undefined;
  const cancelled = vi.fn();
  const transport: typeof fetch = (_url, init) => {
    signal = init?.signal;
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"delta":"Начало"}\n\n'),
            );
          },
          cancel: cancelled,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
  };
  const iterator = createApiFeedbackProvider(transport, () => true)
    .streamFeedback(request, new AbortController().signal)
    [Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: 'Начало' });
  await iterator.return?.();
  expect(signal?.aborted).toBe(true);
  expect(cancelled).toHaveBeenCalledTimes(1);
  const updates = await receive(() =>
    Promise.resolve(
      sse('data: {"delta":"x"}\n\n'.repeat(1000) + 'data: [DONE]\n\n'),
    ),
  );
  expect(updates).toHaveLength(1);
  expect(updates[0]).toContain('x'.repeat(1000));
});
test.each([
  ['data: [DONE]\n\n', 'invalid-response'],
  ['data: {"delta":"[[unknown]]"}\n\ndata: [DONE]\n\n', 'invalid-response'],
  ['data: {"delta":"Без конца"}\n\n', 'invalid-response'],
  ['data: not-json\n\ndata: [DONE]\n\n', 'invalid-response'],
  ['data: {"delta":1}\n\n', 'invalid-response'],
  ['data: {"delta":"x","model":"private"}\n\n', 'invalid-response'],
  ['data: {"delta":" "}\n\ndata: [DONE]\n\n', 'invalid-response'],
  [
    'event: error\ndata: {"error":{"code":"budget","message":"private"}}\n\n',
    'budget',
  ],
  ['event: error\ndata: {"error":{"code":"private-error"}}\n\n', 'unavailable'],
  ['event: unknown\ndata: {"delta":"x"}\n\n', 'invalid-response'],
  ['data: ' + 'x'.repeat(65537), 'invalid-response'],
  [
    'data: ' + JSON.stringify({ delta: 'x'.repeat(12001) }) + '\n\n',
    'invalid-response',
  ],
])('rejects incomplete or malformed SSE %#', async (body, code) => {
  await expect(receive(() => Promise.resolve(sse(body)))).rejects.toMatchObject(
    { code },
  );
});
test.each([
  [429, 'rate-minute', 'rate-limit'],
  [429, 'rate-day', 'rate-limit'],
  [503, 'budget', 'budget'],
  [503, 'ai-disabled', 'disabled'],
  [504, 'timeout', 'timeout'],
  [503, 'private', 'unavailable'],
])(
  'maps safe HTTP error %# without diagnostics',
  async (status, code, expected) => {
    const transport: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          { error: { code, message: 'private-student-input' } },
          { status },
        ),
      );
    await expect(receive(transport)).rejects.toMatchObject({ code: expected });
  },
);
test('HTML 429 is a rate error, bad media/UTF-8 are invalid, network failure is separate', async () => {
  await expect(
    receive(() => Promise.resolve(new Response('private', { status: 429 }))),
  ).rejects.toMatchObject({ code: 'rate-limit' });
  await expect(
    receive(() => Promise.resolve(new Response(raw))),
  ).rejects.toMatchObject({ code: 'invalid-response' });
  await expect(
    receive(() =>
      Promise.resolve(
        new Response(new Uint8Array([255]), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    ),
  ).rejects.toMatchObject({ code: 'invalid-response' });
  await expect(
    receive(() => Promise.reject(new TypeError('private-network'))),
  ).rejects.toMatchObject({ code: 'network' });
});
test('abort while waiting for fetch discards late body and never updates', async () => {
  let release: ((response: Response) => void) | undefined;
  const transport: typeof fetch = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  const controller = new AbortController();
  const result = receive(transport, request, controller.signal);
  controller.abort('private-reason');
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  const cancelled = vi.fn();
  release?.(new Response(new ReadableStream({ cancel: cancelled })));
  await Promise.resolve();
  expect(cancelled).toHaveBeenCalledTimes(1);
});
test('whole stream has a 30 second deadline and cancels stalled body', async () => {
  vi.useFakeTimers();
  const cancelled = vi.fn();
  const transport: typeof fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"delta":"Начало"}\n\n'),
            );
          },
          cancel: cancelled,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
  const result = receive(transport);
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
test.each(xssContent)(
  'AI allowlist prevents XSS in every partial and cached render %#',
  (source) => {
    for (const text of [
      source.slice(0, Math.floor(source.length / 2)),
      source,
    ]) {
      const html = renderFeedback(text);
      expect(html).not.toMatch(
        /<(?:a|img|script|iframe|svg|form|input|style|h1|table)\b/iu,
      );
      expect(html).not.toMatch(/<[^>]*\s(?:href|src|style|on\w+)\s*=/iu);
    }
  },
);
test('trusted tokens alone become local links; unknown tokens and arbitrary markdown links disappear', () => {
  const html = renderFeedback(
    '[[lesson:bits-bytes]] [[stream:16]] [[lesson:missing]] [[stream:17]] [[stream:01]] [[other:foo]] [[unknown]] [чужая](https://outside.test/) ![img](https://outside.test/pixel)',
  );
  expect(html.match(/<a /gu)).toHaveLength(2);
  expect(html).toContain('/test-oge-app/materials/i1/bits-bytes/');
  expect(html).toContain('/test-oge-app/stream/?numbers=16');
  expect(html).not.toContain('outside.test');
  expect(html).not.toContain('[[');
  expect(html).toContain('target="_blank" rel="noopener"');
  expect(
    renderFeedback('`[[stream:1]]`\n\n```text\n[[lesson:bits-bytes]]\n```'),
  ).not.toContain('<a');
  expect(renderFeedback(String.raw`$\frac{8}{2}$`)).toContain('<mfrac>');
});
test('only complete raw markdown is cached, re-sanitised and keyed by seed, answer AND reasoning', async () => {
  const { port, values } = memory();
  const cache = new SessionCache(() => port);
  const transport = vi.fn<typeof fetch>(() => Promise.resolve(sse()));
  const provider = createApiFeedbackProvider(transport, () => true);
  const updates: string[] = [];
  const consume = (input = request) =>
    consumeCachedFeedback(
      provider,
      input,
      new AbortController().signal,
      (html) => updates.push(html),
      cache,
    );
  await consume();
  await consume();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(cache.snapshot().entries[0]?.response).toContain('### Итог');
  expect(cache.snapshot().entries[0]?.response).not.toContain('<h3>');
  await consume({ ...request, reasoning: 'Другой черновик' });
  await consume({ ...request, answer: '2' });
  await consume({ ...request, seed: 'different' });
  expect(transport).toHaveBeenCalledTimes(4);
  expect(JSON.stringify([...values])).not.toContain('Мой черновик');
  const restored = new SessionCache(() => port);
  await consumeCachedFeedback(
    provider,
    request,
    new AbortController().signal,
    (html) => updates.push(html),
    restored,
  );
  expect(transport).toHaveBeenCalledTimes(4);
});
test('failed, stopped and truncated responses never populate session cache', async () => {
  const { port } = memory();
  const cache = new SessionCache(() => port);
  for (const raw of [
    'data: {"delta":"Часть"}\n\n',
    'event: error\ndata: {"error":{"code":"budget"}}\n\n',
  ]) {
    const provider = createApiFeedbackProvider(
      () => Promise.resolve(sse(raw)),
      () => true,
    );
    await expect(
      consumeCachedFeedback(
        provider,
        request,
        new AbortController().signal,
        () => undefined,
        cache,
      ),
    ).rejects.toBeInstanceOf(FeedbackError);
    expect(cache.snapshot().entries).toEqual([]);
  }
});
test('unavailable session storage preserves the result in memory and imported markup is not trusted', async () => {
  const cache = new SessionCache(() => {
    throw new Error('blocked');
  });
  const streamFeedback = vi.fn<FeedbackProvider['streamFeedback']>(
    async function* () {
      yield await Promise.resolve('Текст <img onerror=attack>');
    },
  );
  const provider = { streamFeedback };
  const updates: string[] = [];
  for (let i = 0; i < 2; i++)
    await consumeCachedFeedback(
      provider,
      request,
      new AbortController().signal,
      (html) => updates.push(html),
      cache,
    );
  expect(streamFeedback).toHaveBeenCalledTimes(1);
  expect(updates.at(-1)).not.toContain('<img');
  expect(cache.memoryOnly).toBe(true);
});
test('errors use safe Russian text and never log the request', async () => {
  const logs = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
    vi.spyOn(console, 'info'),
  ];
  for (const code of [
    'rate-limit',
    'budget',
    'network',
    'timeout',
    'disabled',
  ] as const)
    expect(feedbackErrorMessage(new FeedbackError(code))).toMatch(/[а-я]/u);
  await expect(
    receive(() => Promise.reject(new TypeError('private-request-data'))),
  ).rejects.toMatchObject({ code: 'network' });
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
