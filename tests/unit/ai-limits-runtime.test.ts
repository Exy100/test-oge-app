import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import {
  feedbackInput,
  programInput,
  summaryInput,
} from '../fixtures/openrouter-data';
import { quotaSettings } from '../fixtures/ai-quota';

test('real SQLite Durable Object serializes rate/budget across modes and preserves both on eviction', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'tests/fixtures/ai-limits-worker.ts', formats: ['es'] },
    },
  });
  const chunks = (Array.isArray(bundle) ? bundle : [bundle])
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Не собран Worker лимитов.');
  const name = 'ai-limits-test';
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name,
          compatibilityDate: '2026-10-01',
          compatibilityFlags: ['enable_request_signal'],
          manifest: {
            mainModule: entry.fileName,
            modules: Object.fromEntries(
              chunks.map((chunk) => [
                chunk.fileName,
                { type: 'esm' as const, contents: chunk.code },
              ]),
            ),
          },
          env: {
            ...Object.fromEntries(
              Object.entries({
                ...quotaSettings,
                AI_DAILY_REQUEST_LIMIT: '14',
              }).map(([key, value]) => [key, { type: 'text' as const, value }]),
            ),
            AI_QUOTA: {
              type: 'durable-object',
              worker: name,
              exportName: 'AiQuota',
            },
          },
          exports: { AiQuota: { type: 'durable-object', storage: 'sqlite' } },
        },
      },
    ],
  });
  async function send(ip: string, index = 0, extra = {}) {
    const [mode, body] =
      index % 3 === 1
        ? ['part2-grade', programInput]
        : index % 3 === 2
          ? ['variant-summary', summaryInput]
          : ['stream-feedback', feedbackInput];
    const response = await runtime.dispatchFetch(
      quotaSettings.SITE_ORIGIN + '/api/ai/' + mode,
      {
        method: 'POST',
        headers: {
          Origin: quotaSettings.SITE_ORIGIN,
          'Content-Type': 'application/json',
          'X-Fixture-IP': ip,
          ...extra,
        },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    return {
      status: response.status,
      calls: Number(response.headers.get('X-Fixture-Calls')),
      retry: response.headers.get('Retry-After'),
      text,
    };
  }
  try {
    const off = await send('192.0.2.1', 0, { 'X-Fixture-Disabled': 'true' });
    expect(off.status).toBe(503);
    expect(off.calls).toBe(0);
    expect(off.text).toContain('ai-disabled');
    const health = await runtime.dispatchFetch(
      quotaSettings.SITE_ORIGIN + '/api/ai/health',
    );
    expect(await health.json()).toEqual({ enabled: true });
    const first = await Promise.all(
      Array.from({ length: 11 }, (_, index) => send('192.0.2.1', index)),
    );
    expect(first.filter((response) => response.status === 200)).toHaveLength(
      10,
    );
    expect(first.filter((response) => response.status === 429)).toHaveLength(1);
    expect(first.reduce((sum, response) => sum + response.calls, 0)).toBe(10);
    expect(first.find((response) => response.status === 429)?.retry).toMatch(
      /^\d+$/u,
    );
    await runtime.unsafeEvictDurableObject(name, 'AiQuota', {
      name: 'global-v1',
    });
    const stillLimited = await send('192.0.2.1');
    expect(stillLimited.status).toBe(429);
    expect(stillLimited.calls).toBe(0);
    // A fallback consumes two slots in the same actual SQLite counter.
    const fallback = await send('192.0.2.2', 0, {
      'X-Fixture-Fallback': 'true',
    });
    expect(fallback.status).toBe(200);
    expect(fallback.calls).toBe(2);
    await runtime.unsafeEvictDurableObject(name, 'AiQuota', {
      name: 'global-v1',
    });
    const denied = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        send(`192.0.2.${String(index + 3)}`, index),
      ),
    );
    expect(denied.filter((response) => response.status === 200)).toHaveLength(
      2,
    );
    expect(denied.reduce((sum, response) => sum + response.calls, 0)).toBe(2);
    for (const response of denied.filter(
      (response) => response.status !== 200,
    )) {
      expect(response.status).toBe(503);
      expect(response.calls).toBe(0);
      expect(JSON.parse(response.text)).toMatchObject({
        error: { code: 'budget' },
      });
    }
    await runtime.unsafeEvictDurableObject(name, 'AiQuota', {
      name: 'global-v1',
    });
    const stillExhausted = await send('192.0.2.98');
    expect(stillExhausted.status).toBe(503);
    expect(stillExhausted.calls).toBe(0);
    const disabledAgain = await send('192.0.2.99', 0, {
      'X-Fixture-Disabled': 'true',
    });
    expect(disabledAgain.calls).toBe(0);
    expect(disabledAgain.text).toContain('ai-disabled');
  } finally {
    await runtime.dispose();
  }
}, 20_000);
