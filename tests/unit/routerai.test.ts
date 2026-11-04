import { afterEach, expect, test, vi } from 'vitest';
import { aiServiceId } from '../../src/core/ai-service';
import { LocalStore } from '../../src/core/storage/store';
import { createOpenRouter } from '../../worker/src/openrouter';
import { createConfiguredWorker, createWorker } from '../../worker/src/index';
import { quotaFixture } from '../fixtures/ai-quota';
import {
  routerEnv,
  preparedFeedback,
  preparedSummary,
  preparedProgram,
  preparedOffice,
  feedbackInput,
  programGrade,
  officeGrade,
  completion,
  providerStream,
  providerPayload,
} from '../fixtures/openrouter-data';

const settings = {
  SITE_ORIGIN: routerEnv.SITE_ORIGIN,
  AI_PROVIDER: 'routerai',
  ROUTERAI_API_KEY: 'fixture-routerai-credential',
  AI_MODEL_PRIMARY: 'openai/gpt-6-luna',
  AI_MODEL_FALLBACK: 'anthropic/claude-sonnet-5.5',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([preparedFeedback, preparedSummary, preparedProgram, preparedOffice])(
  'RouterAI serves $mode with the configured recipient, key and existing response contract',
  async (prepared) => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        prepared.mode === 'part2-grade'
          ? completion(
              prepared.assessment.kind === 'criteria-help'
                ? officeGrade
                : programGrade,
            )
          : providerStream(),
      ),
    );
    const response = await createOpenRouter(settings, transport).respond(
      prepared,
      new AbortController().signal,
    );
    if (prepared.mode === 'part2-grade')
      expect(await response.json()).toEqual(
        prepared.assessment.kind === 'criteria-help'
          ? officeGrade
          : programGrade,
      );
    else expect(await response.text()).toContain('data: [DONE]');
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url).toBe('https://routerai.ru/api/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer fixture-routerai-credential',
    );
    expect(init?.redirect).toBe('manual');
    expect(providerPayload(init)).toMatchObject({
      model: settings.AI_MODEL_PRIMARY,
      provider: { data_collection: 'deny' },
    });
    expect(providerPayload(init)).not.toHaveProperty('temperature');
    expect(JSON.stringify(providerPayload(init))).not.toContain(
      settings.ROUTERAI_API_KEY,
    );
  },
);

test('RouterAI fallback stays at RouterAI and uses the second configured model', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(providerStream());
  const response = await createOpenRouter(settings, transport).respond(
    preparedFeedback,
    new AbortController().signal,
  );
  await response.text();
  expect(
    transport.mock.calls.map(([url, init]) => [url, providerPayload(init)]),
  ).toEqual([
    [
      'https://routerai.ru/api/v1/chat/completions',
      expect.objectContaining({ model: settings.AI_MODEL_PRIMARY }),
    ],
    [
      'https://routerai.ru/api/v1/chat/completions',
      expect.objectContaining({ model: settings.AI_MODEL_FALLBACK }),
    ],
  ]);
});

test.each([
  {
    ROUTERAI_API_KEY: undefined,
    OPENROUTER_API_KEY: 'wrong-provider-credential',
  },
  { ROUTERAI_API_KEY: '' },
  { ROUTERAI_API_KEY: 'invalid\nheader' },
  { AI_PROVIDER: 'https://untrusted.invalid' },
])('invalid RouterAI settings cannot start a request: %j', (change) => {
  const transport = vi.fn<typeof fetch>();
  expect(() =>
    createOpenRouter({ ...settings, ...change }, transport),
  ).toThrow();
  expect(transport).not.toHaveBeenCalled();
});

test('configured RouterAI uses the existing IP and daily budget checks before each billable fallback', async () => {
  const fixture = quotaFixture('1');
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 429 })),
  );
  const response = await createConfiguredWorker(transport).fetch(
    new Request(settings.SITE_ORIGIN + '/api/ai/stream-feedback', {
      method: 'POST',
      headers: {
        Origin: settings.SITE_ORIGIN,
        'Content-Type': 'application/json',
        'X-AI-Provider': 'routerai',
        'CF-Connecting-IP': '192.0.2.1',
      },
      body: JSON.stringify(feedbackInput),
    }),
    { ...fixture.env, ...settings },
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: 'budget' } });
  expect(transport).toHaveBeenCalledTimes(1);
});

test.each([
  ['routerai', 'openrouter'],
  ['routerai', null],
  ['openrouter', 'routerai'],
])(
  'recipient mismatch %s/%s is rejected before admission or upstream',
  async (configured, expected) => {
    const transport = vi.fn<typeof fetch>();
    const admit = vi.fn<() => Promise<void>>();
    const client = createOpenRouter(
      { ...settings, ...routerEnv, AI_PROVIDER: configured },
      transport,
    );
    const response = await createWorker(client, admit).fetch(
      new Request(settings.SITE_ORIGIN + '/api/ai/stream-feedback', {
        method: 'POST',
        headers: {
          Origin: settings.SITE_ORIGIN,
          'Content-Type': 'application/json',
          ...(expected ? { 'X-AI-Provider': expected } : {}),
        },
        body: JSON.stringify(feedbackInput),
      }),
      { ...settings, AI_PROVIDER: configured },
    );
    expect(response.status).toBe(409);
    expect(transport).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  },
);

test('RouterAI requires new consent for each mode and uses a distinct cache policy', async () => {
  vi.stubEnv('PUBLIC_AI_PROVIDER', 'routerai');
  const { AI_POLICY, grantAiConsent, hasAiConsent } =
    await import('../../src/lib/ai/consent');
  const { aiServiceHeaders } = await import('../../src/lib/ai/service');
  const store = new LocalStore(() => {
    throw new Error('Memory only');
  });
  store.write('aiConsent', {
    version: 1,
    enabled: true,
    policy: 'openrouter-feedback-v1',
    modes: ['stream-feedback', 'part2-grade', 'variant-summary'],
  });
  for (const mode of [
    'stream-feedback',
    'part2-grade',
    'variant-summary',
  ] as const)
    expect(hasAiConsent(store, mode)).toBe(false);
  expect(AI_POLICY).toBe('routerai-feedback-v1');
  expect(aiServiceHeaders).toEqual({ 'X-AI-Provider': 'routerai' });
  grantAiConsent(store);
  expect(hasAiConsent(store)).toBe(true);
  expect(hasAiConsent(store, 'part2-grade')).toBe(false);
  expect(store.read('aiConsent').policy).toBe('routerai-feedback-v1');
});

test('service selection preserves old builds and rejects unknown destinations', () => {
  expect(aiServiceId(undefined)).toBe('openrouter');
  expect(aiServiceId('routerai')).toBe('routerai');
  expect(() => aiServiceId('https://untrusted.invalid')).toThrow();
});
