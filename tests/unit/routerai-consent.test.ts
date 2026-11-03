import { afterEach, expect, test, vi } from 'vitest';
import { LocalStore } from '../../src/core/storage/store';
import { SessionCache } from '../../src/core/storage/cache';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
async function modules() {
  vi.stubEnv('PUBLIC_AI_PROVIDER', 'routerai');
  vi.resetModules();
  return {
    consent: await import('../../src/lib/ai/consent'),
    http: await import('../../src/lib/ai/http'),
    feedback: await import('../../src/lib/ai/feedback'),
  };
}
test('OpenRouter permission never authorizes RouterAI; the new policy survives a fresh storage read per mode', async () => {
  const { consent } = await modules();
  const port = memory();
  const store = new LocalStore(() => port);
  store.write('aiConsent', {
    version: 1,
    enabled: true,
    policy: 'openrouter-feedback-v1',
    modes: ['stream-feedback', 'part2-grade', 'variant-summary'],
  });
  expect(consent.hasAiConsent(store)).toBe(false);
  consent.grantAiConsent(store);
  const fresh = new LocalStore(() => port);
  expect(fresh.read('aiConsent').policy).toBe('routerai-feedback-v1');
  expect(consent.hasAiConsent(fresh)).toBe(true);
  expect(consent.hasAiConsent(fresh, 'part2-grade')).toBe(false);
  consent.grantAiConsent(fresh, 'part2-grade');
  expect(consent.hasAiConsent(new LocalStore(() => port), 'part2-grade')).toBe(
    true,
  );
});
test('RouterAI build rejects an OpenRouter or unmarked enabled health before transmission', async () => {
  const { http } = await modules();
  for (const body of [
    { enabled: true },
    { enabled: true, provider: 'openrouter' },
    { enabled: true, provider: 'unknown' },
  ]) {
    await expect(
      http.checkAiHealth(new AbortController().signal, () =>
        Promise.resolve(Response.json(body)),
      ),
    ).rejects.toThrow();
  }
  await expect(
    http.checkAiHealth(new AbortController().signal, () =>
      Promise.resolve(Response.json({ enabled: true, provider: 'routerai' })),
    ),
  ).resolves.toBeUndefined();
});
test('provider-specific cache does not reuse an old completed OpenRouter response for the same task', async () => {
  const cache = new SessionCache(() => memory());
  const input = {
    generatorId: 'numeral-sum-v2',
    seed: 'cache-provider',
    answer: '1',
  };
  vi.stubEnv('PUBLIC_AI_PROVIDER', 'openrouter');
  vi.resetModules();
  const old = await import('../../src/lib/ai/feedback');
  await old.consumeCachedFeedback(
    {
      async *streamFeedback() {
        yield await Promise.resolve('Старый разбор');
      },
    },
    input,
    new AbortController().signal,
    () => undefined,
    cache,
  );
  expect(cache.snapshot().entries.map((entry) => entry.mode)).toContain(
    'stream-feedback/openrouter-feedback-v1',
  );
  const { feedback } = await modules();
  let calls = 0;
  const provider = {
    async *streamFeedback() {
      calls++;
      yield await Promise.resolve('Новый разбор');
    },
  };
  let html = '';
  await feedback.consumeCachedFeedback(
    provider,
    input,
    new AbortController().signal,
    (value) => {
      html = value;
    },
    cache,
  );
  expect(calls).toBe(1);
  expect(html).toContain('Новый разбор');
  expect(html).not.toContain('Старый разбор');
  expect(cache.snapshot().entries.map((entry) => entry.mode)).toContain(
    'stream-feedback/routerai-feedback-v1',
  );
});
