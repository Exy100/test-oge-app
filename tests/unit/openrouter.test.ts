import { afterEach, expect, test, vi } from 'vitest';
import { z } from '../../src/core/zod';
import { createOpenRouter } from '../../worker/src/openrouter';
import { TransportError } from '../../worker/src/transport';
import worker, { createWorker } from '../../worker/src/index';
import {
  routerEnv,
  providerPayload,
  feedbackInput,
  programInput,
  summaryInput,
  preparedFeedback,
  preparedProgram,
  preparedOffice,
  preparedSummary,
  programGrade,
  officeGrade,
  delta,
  completedStream,
  providerStream,
  completion,
} from '../fixtures/openrouter-data';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const encoder = new TextEncoder();
const freshSignal = () => new AbortController().signal;
function post(path: string, body: unknown, signal?: AbortSignal) {
  return new Request(routerEnv.SITE_ORIGIN + path, {
    method: 'POST',
    headers: {
      Origin: routerEnv.SITE_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}
function models(transport: ReturnType<typeof vi.fn<typeof fetch>>) {
  return transport.mock.calls.map(
    ([, init]) =>
      z.object({ model: z.string() }).parse(providerPayload(init)).model,
  );
}
async function safeRejection(pending: Promise<unknown>, code: string) {
  const failure: unknown = await pending.catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(TransportError);
  expect(failure).toMatchObject({ code });
  expect(String(failure)).not.toContain('private');
  return failure;
}

for (const [prepared, tokens] of [
  [preparedFeedback, 700],
  [preparedSummary, 1200],
] as const) {
  test(`SSE ${prepared.mode} uses configured models, privacy, attribution and token budget`, async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(providerStream()),
    );
    const response = await createOpenRouter(routerEnv, transport).respond(
      prepared,
      freshSignal(),
    );
    expect(response.headers.get('Content-Type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(response.headers.get('X-Provider-Diagnostic')).toBeNull();
    expect(await response.text()).toBe(
      'data: {"delta":"Привет, ученик!"}\n\ndata: [DONE]\n\n',
    );
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer fixture-credential');
    expect(headers.get('HTTP-Referer')).toBe(routerEnv.SITE_ORIGIN);
    expect(headers.get('X-Title')).toBe('OGE Informatics');
    const body: unknown = providerPayload(init);
    expect(body).toMatchObject({
      model: routerEnv.AI_MODEL_PRIMARY,
      provider: { data_collection: 'deny' },
      max_tokens: tokens,
      temperature: 0.3,
      stream: true,
    });
    expect(body).not.toHaveProperty('response_format');
    expect(JSON.stringify(body)).not.toContain(routerEnv.OPENROUTER_API_KEY);
    expect(transport).toHaveBeenCalledTimes(1);
  });
}

for (const status of [429, 500, 503, 599]) {
  test(`HTTP ${String(status)} cancels the failed body and uses the fallback once`, async () => {
    const cancel = vi.fn();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status }),
      )
      .mockResolvedValueOnce(providerStream());
    const response = await createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    );
    expect(await response.text()).toContain('data: [DONE]');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(models(transport)).toEqual([
      routerEnv.AI_MODEL_PRIMARY,
      routerEnv.AI_MODEL_FALLBACK,
    ]);
    const bodies = transport.mock.calls.map(
      ([, init]) =>
        z.object({ messages: z.unknown() }).parse(providerPayload(init))
          .messages,
    );
    expect(bodies[0]).toEqual(bodies[1]);
  });
}
for (const status of [400, 401, 403, 404]) {
  test(`HTTP ${String(status)} fails privately without a fallback`, async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('private-provider-diagnostic fixture-credential', {
          status,
        }),
      ),
    );
    await safeRejection(
      createOpenRouter(routerEnv, transport).respond(
        preparedFeedback,
        freshSignal(),
      ),
      'upstream',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
}
test('two retryable failures stop after exactly two requests', async () => {
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response('private-diagnostic', { status: 503 })),
  );
  await safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    ),
    'upstream',
  );
  expect(transport).toHaveBeenCalledTimes(2);
});
test('network failure does not expose its cause or start an extra request', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error('private-network-credential'));
  await safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    ),
    'upstream',
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

for (const change of [
  { OPENROUTER_API_KEY: '' },
  { OPENROUTER_API_KEY: 'bad\nheader' },
  { AI_MODEL_PRIMARY: 'unknown-no-provider' },
  { AI_MODEL_FALLBACK: routerEnv.AI_MODEL_PRIMARY },
  { SITE_ORIGIN: 'invalid' },
  { SITE_ORIGIN: 'https://user:password@example.test' },
  { SITE_ORIGIN: 'https://example.test/path' },
]) {
  test(`invalid server configuration fails before network: ${JSON.stringify(Object.keys(change))}`, () => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      createOpenRouter({ ...routerEnv, ...change }, transport),
    ).toThrow(TransportError);
    expect(transport).not.toHaveBeenCalled();
  });
}

test('JSON mode requests 500 tokens, validates the grade and strips provider metadata', async () => {
  const transport = vi.fn<typeof fetch>(() => Promise.resolve(completion()));
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedProgram,
    freshSignal(),
  );
  expect(await response.json()).toEqual(programGrade);
  const body: unknown = providerPayload(transport.mock.calls[0]?.[1]);
  expect(body).toMatchObject({
    stream: false,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });
});
test('office criteria-help keeps score null, never zero', async () => {
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(completion(officeGrade)),
  );
  expect(
    await (
      await createOpenRouter(routerEnv, transport).respond(
        preparedOffice,
        freshSignal(),
      )
    ).json(),
  ).toEqual(officeGrade);
});

for (const invalid of [
  'not JSON private-provider-diagnostic',
  { ...programGrade, score: 3 },
  { ...programGrade, score: '1' },
  { ...programGrade, score: null },
  { ...programGrade, score: 0.5 },
  { ...programGrade, kind: 'criteria-help' },
  { ...programGrade, unexpected: 'private-field' },
  { ...programGrade, reason: '' },
  { ...programGrade, errors: [12] },
]) {
  test(`invalid JSON grade gets exactly one retry: ${JSON.stringify(invalid).slice(0, 80)}`, async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(completion(invalid)),
    );
    await safeRejection(
      createOpenRouter(routerEnv, transport).respond(
        preparedProgram,
        freshSignal(),
      ),
      'invalid-response',
    );
    expect(models(transport)).toEqual([
      routerEnv.AI_MODEL_PRIMARY,
      routerEnv.AI_MODEL_FALLBACK,
    ]);
  });
}
test('a valid second JSON response recovers without inventing a grade', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(completion('not JSON'))
    .mockResolvedValueOnce(completion());
  expect(
    await (
      await createOpenRouter(routerEnv, transport).respond(
        preparedProgram,
        freshSignal(),
      )
    ).json(),
  ).toEqual(programGrade);
  expect(transport).toHaveBeenCalledTimes(2);
});
test('429 followed by invalid JSON cannot trigger a third provider request', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('private-error', { status: 429 }))
    .mockResolvedValueOnce(completion('invalid'));
  await safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedProgram,
      freshSignal(),
    ),
    'invalid-response',
  );
  expect(transport).toHaveBeenCalledTimes(2);
});
test('office numeric grades and truncated completions are rejected twice', async () => {
  for (const response of [
    () => completion({ ...officeGrade, score: 0 }),
    () =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify(officeGrade) },
            finish_reason: 'length',
          },
        ],
      }),
  ]) {
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(response()));
    await safeRejection(
      createOpenRouter(routerEnv, transport).respond(
        preparedOffice,
        freshSignal(),
      ),
      'invalid-response',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  }
});

test('SSE handles split UTF-8, CRLF, multiline data, comments and usage-only frames', async () => {
  const raw =
    ': keepalive\r\nid: private-id\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"Привет 👋"},"finish_reason":null}]}\r\n\r\n' +
    delta('', 'stop') +
    'data: {"choices":[],"usage":{"private":1}}\n\ndata: [DONE]\n\n';
  const bytes = encoder.encode(raw);
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(upstream, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    freshSignal(),
  );
  expect(await response.text()).toBe(
    'data: {"delta":"Привет 👋"}\n\ndata: [DONE]\n\n',
  );
});
test('the first delta arrives before the provider finishes', async () => {
  let source: ReadableStreamDefaultController<Uint8Array> | undefined;
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller;
      controller.enqueue(encoder.encode(delta('Первый шаг')));
    },
  });
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(upstream, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    freshSignal(),
  );
  const reader = response.body?.getReader();
  if (!reader || !source) throw new Error('Нет потока проверки.');
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    'data: {"delta":"Первый шаг"}\n\n',
  );
  source.enqueue(
    encoder.encode(
      delta('Второй шаг') + delta('', 'stop') + 'data: [DONE]\n\n',
    ),
  );
  source.close();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    'Второй шаг',
  );
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    'data: [DONE]\n\n',
  );
  expect((await reader.read()).done).toBe(true);
  reader.releaseLock();
});

for (const [name, raw] of [
  ['malformed event', 'data: private-invalid-json\n\n'],
  [
    'provider error',
    'data: {"error":{"message":"private-provider-credential"}}\n\n',
  ],
  ['error event', 'event: error\ndata: private-provider-diagnostic\n\n'],
  ['missing completion', delta('Часть ответа')],
  ['empty completion', delta('', 'stop') + 'data: [DONE]\n\n'],
  ['done without stop', delta('Часть ответа') + 'data: [DONE]\n\n'],
  [
    'truncated completion',
    delta('Часть ответа', 'length') + 'data: [DONE]\n\n',
  ],
  ['tool finish', delta('Часть ответа', 'tool_calls') + 'data: [DONE]\n\n'],
  [
    'text after stop',
    delta('Часть ответа', 'stop') + delta('Ещё') + 'data: [DONE]\n\n',
  ],
  ['large output', completedStream('я'.repeat(12_001))],
  ['large frame', 'data: ' + 'x'.repeat(65_537) + '\n\n'],
] as const) {
  test(`bad SSE ${name} is a safe terminal error without fallback or false DONE`, async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(providerStream(raw)),
    );
    const response = await createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    );
    const result = await response.text();
    expect(result).toContain('event: error\n');
    expect(result).not.toContain('[DONE]');
    expect(result).not.toContain('private');
    expect(transport).toHaveBeenCalledTimes(1);
  });
}
test('wrong media type is rejected before returning a stream', async () => {
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ private: 'diagnostic' })),
  );
  await safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    ),
    'invalid-response',
  );
});
test('invalid UTF-8 and oversized provider bodies fail closed', async () => {
  for (const body of [Uint8Array.of(0xff), new Uint8Array(1_048_577)]) {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );
    const result = await (
      await createOpenRouter(routerEnv, transport).respond(
        preparedFeedback,
        freshSignal(),
      )
    ).text();
    expect(result).toContain('invalid-response');
    expect(result).not.toContain('[DONE]');
  }
});

test('already-aborted requests never call the provider', async () => {
  const controller = new AbortController();
  controller.abort('private-reason');
  const transport = vi.fn<typeof fetch>();
  await safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      controller.signal,
    ),
    'cancelled',
  );
  expect(transport).not.toHaveBeenCalled();
});
test('disconnect during fetch aborts upstream even if the transport ignores its signal', async () => {
  const controller = new AbortController();
  const transport = vi.fn<typeof fetch>(() => new Promise(() => undefined));
  const pending = safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      controller.signal,
    ),
    'cancelled',
  );
  controller.abort('private-reason');
  await pending;
  expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});
test('the 30 second deadline also bounds a non-cooperative fetch', async () => {
  vi.useFakeTimers();
  const transport = vi.fn<typeof fetch>(() => new Promise(() => undefined));
  const pending = safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    ),
    'timeout',
  );
  await vi.advanceTimersByTimeAsync(29_999);
  expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test('fallback shares the original deadline instead of granting another 30 seconds', async () => {
  vi.useFakeTimers();
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(new Response(null, { status: 429 }));
          }, 20_000),
        ),
    )
    .mockImplementationOnce(() => new Promise(() => undefined));
  const pending = safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      freshSignal(),
    ),
    'timeout',
  );
  await vi.advanceTimersByTimeAsync(20_000);
  expect(transport).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
test('timeout cancels a stalled JSON body without retrying', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  const pending = safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedProgram,
      freshSignal(),
    ),
    'timeout',
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(1);
});
test('timeout terminates a stalled SSE body with a safe event', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(delta('Начало')));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    freshSignal(),
  );
  const result = response.text();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toContain('"code":"timeout"');
  expect(await result).not.toContain('[DONE]');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
test('client cancellation releases a backpressured stream and its timer', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(delta('Начало')));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    freshSignal(),
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Нет ответа.');
  await reader.read();
  await reader.cancel();
  reader.releaseLock();
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test('the deadline releases an unread backpressured stream before a consumer resumes', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(delta('Начало')));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    freshSignal(),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  const text = await response.text();
  expect(text).toContain('"code":"timeout"');
  expect(text).not.toContain('[DONE]');
});
test('disconnect without reading a stream still releases the provider and deadline', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const controller = new AbortController();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(source) {
            source.enqueue(encoder.encode(delta('Начало')));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ),
  );
  const response = await createOpenRouter(routerEnv, transport).respond(
    preparedFeedback,
    controller.signal,
  );
  controller.abort('private-reason');
  await vi.advanceTimersByTimeAsync(0);
  expect(await response.text()).not.toContain('[DONE]');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
test('late responses from a non-cooperative cancelled fetch are discarded', async () => {
  const cancel = vi.fn();
  let resolve: ((value: Response) => void) | undefined;
  const transport = vi.fn<typeof fetch>(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const controller = new AbortController();
  const pending = safeRejection(
    createOpenRouter(routerEnv, transport).respond(
      preparedFeedback,
      controller.signal,
    ),
    'cancelled',
  );
  controller.abort();
  await pending;
  if (!resolve) throw new Error('Нет ожидающего запроса.');
  resolve(new Response(new ReadableStream({ cancel })));
  await Promise.resolve();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('the real HTTP chain validates input and adds security headers to injected SSE and JSON responses', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(providerStream())
    .mockResolvedValueOnce(completion())
    .mockResolvedValueOnce(providerStream());
  const server = createWorker(createOpenRouter(routerEnv, transport));
  for (const [path, body] of [
    ['stream-feedback', feedbackInput],
    ['part2-grade', programInput],
    ['variant-summary', summaryInput],
  ] as const) {
    const response = await server.fetch(
      post('/api/ai/' + path, body),
      routerEnv,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Authorization')).toBeNull();
    expect(await response.text()).not.toContain('private');
  }
  const invalid = await server.fetch(
    post('/api/ai/stream-feedback', {
      ...feedbackInput,
      model: 'client/model',
    }),
    routerEnv,
  );
  expect(invalid.status).toBe(400);
  expect(transport).toHaveBeenCalledTimes(3);
});
test('the public Worker stays disabled even if server credentials are present', async () => {
  const transport = vi.spyOn(globalThis, 'fetch');
  const response = await worker.fetch(
    post('/api/ai/stream-feedback', feedbackInput),
    routerEnv,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: 'ai-disabled',
      message: 'ИИ отключён. Доступен локальный пример на сайте.',
    },
  });
  const health = await worker.fetch(
    new Request(routerEnv.SITE_ORIGIN + '/api/ai/health'),
    routerEnv,
  );
  expect(await health.json()).toEqual({ enabled: false });
  expect(transport).not.toHaveBeenCalled();
});
test('provider errors never log credentials, prompts, addresses or student text', async () => {
  const logs = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'info'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
  ];
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response('private-reason fixture-credential', { status: 401 }),
    ),
  );
  const server = createWorker(createOpenRouter(routerEnv, transport));
  const response = await server.fetch(
    post('/api/ai/stream-feedback', {
      ...feedbackInput,
      reasoning: 'private-student-text',
    }),
    routerEnv,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: 'upstream', message: 'Сервис разбора временно недоступен.' },
  });
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
