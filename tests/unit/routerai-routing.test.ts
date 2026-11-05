import {
  nativeStreamResponse,
  nativeCompletion,
} from '../fixtures/anthropic-data';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from '../../src/core/zod';
import { createRouterAi } from '../../worker/src/routerai';
import { TransportError } from '../../worker/src/transport';
import { createConfiguredWorker } from '../../worker/src/index';
import { routerAiSettings, routerAiFeedback } from '../fixtures/routerai-data';
import { quotaFixture } from '../fixtures/ai-quota';
import {
  providerPayload,
  providerStream,
  preparedProgram,
  preparedOffice,
  preparedSummary,
  programGrade,
  officeGrade,
} from '../fixtures/openrouter-data';

afterEach(() => {
  vi.restoreAllMocks();
});
const routedStream: typeof fetch = (url) =>
  Promise.resolve(
    url === 'https://routerai.ru/api/v1/messages'
      ? nativeStreamResponse()
      : providerStream(),
  );
const signal = () => new AbortController().signal;
function selected(transport: ReturnType<typeof vi.fn<typeof fetch>>) {
  return transport.mock.calls.map(
    ([, init]) =>
      z.object({ model: z.string() }).parse(providerPayload(init)).model,
  );
}
for (let number = 1; number <= 12; number++) {
  test(`reconstructed short-answer task ${String(number)} selects the configured primary`, async () => {
    const transport = vi.fn<typeof fetch>(routedStream);
    const response = await createRouterAi(routerAiSettings, transport).respond(
      routerAiFeedback(number).prepared,
      signal(),
    );
    expect(await response.text()).toContain('data: [DONE]');
    expect(selected(transport)).toEqual([
      number <= 4
        ? routerAiSettings.AI_MODEL_SIMPLE
        : routerAiSettings.AI_MODEL_PRIMARY,
    ]);
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url).toBe(
      number <= 4
        ? 'https://routerai.ru/api/v1/chat/completions'
        : 'https://routerai.ru/api/v1/messages',
    );
    expect(init?.redirect).toBe('manual');
    expect(
      new Headers(init?.headers).get(
        number <= 4 ? 'Authorization' : 'x-api-key',
      ),
    ).toBe(
      number <= 4
        ? 'Bearer fixture-routerai-credential'
        : 'fixture-routerai-credential',
    );
    expect(providerPayload(init)).toMatchObject({
      max_tokens: 4000,
      ...(number <= 4
        ? { reasoning: { effort: 'high' } }
        : { output_config: { effort: 'medium' } }),
      provider: { data_collection: 'deny' },
    });
    expect(JSON.stringify(providerPayload(init))).not.toContain(
      routerAiSettings.ROUTERAI_API_KEY,
    );
  });
}
for (const [prepared, grade] of [
  [preparedProgram, programGrade],
  [preparedOffice, officeGrade],
  [preparedSummary, null],
] as const) {
  test(`${prepared.mode}/${'assessment' in prepared ? prepared.assessment.kind : 'summary'} uses Sonnet independently of the simple list`, async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(grade ? nativeCompletion(grade) : nativeStreamResponse()),
    );
    const response = await createRouterAi(routerAiSettings, transport).respond(
      prepared,
      signal(),
    );
    if (grade) expect(await response.json()).toEqual(grade);
    else expect(await response.text()).toContain('data: [DONE]');
    expect(selected(transport)).toEqual([routerAiSettings.AI_MODEL_PRIMARY]);
    expect(providerPayload(transport.mock.calls[0]?.[1])).toMatchObject({
      max_tokens: 4000,
    });
  });
}
for (const number of [1, 10]) {
  for (const status of [429, 503]) {
    test(`task ${String(number)} HTTP ${String(status)} uses exactly its configured fallback`, async () => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(nativeStreamResponse());
      const response = await createRouterAi(
        routerAiSettings,
        transport,
      ).respond(routerAiFeedback(number).prepared, signal());
      await response.text();
      expect(selected(transport)).toEqual(
        number === 1
          ? [
              routerAiSettings.AI_MODEL_SIMPLE,
              routerAiSettings.AI_MODEL_PRIMARY,
            ]
          : [
              routerAiSettings.AI_MODEL_PRIMARY,
              routerAiSettings.AI_MODEL_FALLBACK,
            ],
      );
      expect(transport).toHaveBeenCalledTimes(2);
    });
  }
}
test('two simple-route failures stop at Sonnet without escalating to Opus', async () => {
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 503 })),
  );
  await expect(
    createRouterAi(routerAiSettings, transport).respond(
      routerAiFeedback(1).prepared,
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'upstream' });
  expect(selected(transport)).toEqual([
    routerAiSettings.AI_MODEL_SIMPLE,
    routerAiSettings.AI_MODEL_PRIMARY,
  ]);
});
test('invalid preliminary score retries with Opus and returns only validated JSON', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(nativeCompletion({ ...programGrade, score: 3 }))
    .mockResolvedValueOnce(nativeCompletion(programGrade));
  const response = await createRouterAi(routerAiSettings, transport).respond(
    preparedProgram,
    signal(),
  );
  expect(await response.json()).toEqual(programGrade);
  expect(selected(transport)).toEqual([
    routerAiSettings.AI_MODEL_PRIMARY,
    routerAiSettings.AI_MODEL_FALLBACK,
  ]);
});
test('editable list can move task 10 to Luna while task 1 uses Sonnet; empty list disables simple routing', async () => {
  const transport = vi.fn<typeof fetch>(routedStream);
  for (const [list, number, expected] of [
    ['10, 12', 10, routerAiSettings.AI_MODEL_SIMPLE],
    ['10, 12', 1, routerAiSettings.AI_MODEL_PRIMARY],
    ['', 1, routerAiSettings.AI_MODEL_PRIMARY],
  ] as const) {
    const response = await createRouterAi(
      { ...routerAiSettings, AI_SIMPLE_TASK_NUMBERS: list },
      transport,
    ).respond(routerAiFeedback(number).prepared, signal());
    await response.text();
    expect(selected(transport).at(-1)).toBe(expected);
  }
});
for (const change of [
  { ROUTERAI_API_KEY: '' },
  { ROUTERAI_API_KEY: 'invalid\nheader' },
  { AI_API_BASE_URL: 'https://routerai.ru/api/v1/' },
  { AI_API_BASE_URL: 'https://outside.test/api/v1' },
  { AI_API_BASE_URL: 'http://127.0.0.1/api/v1' },
  { AI_MODEL_SIMPLE: routerAiSettings.AI_MODEL_PRIMARY },
  { AI_MODEL_FALLBACK: routerAiSettings.AI_MODEL_PRIMARY },
  { AI_MODEL_SIMPLE: 'invalid' },
  { AI_SIMPLE_TASK_NUMBERS: '1,1' },
  { AI_SIMPLE_TASK_NUMBERS: '1,13' },
  { AI_SIMPLE_TASK_NUMBERS: '1e1' },
  { AI_SIMPLE_TASK_NUMBERS: '1,,2' },
]) {
  test(`invalid RouterAI configuration fails before network ${JSON.stringify(change)}`, () => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      createRouterAi({ ...routerAiSettings, ...change }, transport),
    ).toThrow(TransportError);
    expect(transport).not.toHaveBeenCalled();
  });
}
function post(input: unknown, mode = 'stream-feedback') {
  return new Request(routerAiSettings.SITE_ORIGIN + '/api/ai/' + mode, {
    method: 'POST',
    headers: {
      Origin: routerAiSettings.SITE_ORIGIN,
      'Content-Type': 'application/json',
      'X-AI-Provider': 'routerai',
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify(input),
  });
}
test('configured HTTP Worker binds health to RouterAI and charges both attempts in the existing quota', async () => {
  const quota = quotaFixture('2');
  const env = {
    ...routerAiSettings,
    AI_QUOTA: quota.env.AI_QUOTA,
    AI_DAILY_REQUEST_LIMIT: '2',
  };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockImplementation(routedStream);
  const worker = createConfiguredWorker(transport);
  const health = await worker.fetch(
    new Request(env.SITE_ORIGIN + '/api/ai/health'),
    env,
  );
  expect(await health.json()).toEqual({ enabled: true, provider: 'routerai' });
  const response = await worker.fetch(post(routerAiFeedback(1).input), env);
  expect(response.status).toBe(200);
  await response.text();
  expect(selected(transport)).toEqual([
    env.AI_MODEL_SIMPLE,
    env.AI_MODEL_PRIMARY,
  ]);
  expect(quota.storage.values.get('budget')).toMatchObject({ count: 2 });
  const blocked = await worker.fetch(post(routerAiFeedback(10).input), env);
  expect(blocked.status).toBe(503);
  expect(await blocked.json()).toMatchObject({ error: { code: 'budget' } });
  expect(transport).toHaveBeenCalledTimes(2);
});
test('forged routing fields are rejected before provider calls', async () => {
  const quota = quotaFixture();
  const transport = vi.fn<typeof fetch>();
  const response = await createConfiguredWorker(transport).fetch(
    post({
      ...routerAiFeedback(10).input,
      taskNumber: 1,
      model: routerAiSettings.AI_MODEL_SIMPLE,
    }),
    { ...routerAiSettings, AI_QUOTA: quota.env.AI_QUOTA },
  );
  expect(response.status).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
test('disabled, incomplete and unknown-provider configurations stay offline', async () => {
  const quota = quotaFixture();
  const transport = vi.fn<typeof fetch>();
  const worker = createConfiguredWorker(transport);
  for (const change of [
    { AI_ENABLED: 'false' },
    { ROUTERAI_API_KEY: '' },
    { AI_PROVIDER: 'unknown' },
  ]) {
    const env = {
      ...routerAiSettings,
      ...change,
      AI_QUOTA: quota.env.AI_QUOTA,
    };
    const health = await worker.fetch(
      new Request(env.SITE_ORIGIN + '/api/ai/health'),
      env,
    );
    if (change.AI_PROVIDER === 'unknown') expect(health.status).toBe(503);
    else expect(await health.json()).toMatchObject({ enabled: false });
    expect(
      (await worker.fetch(post(routerAiFeedback(1).input), env)).status,
    ).toBe(503);
  }
  expect(transport).not.toHaveBeenCalled();
});
