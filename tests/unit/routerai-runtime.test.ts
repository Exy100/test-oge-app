import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { routerAiFeedback, routerAiSettings } from '../fixtures/routerai-data';
import { programInput, summaryInput } from '../fixtures/openrouter-data';

test('RouterAI routes both pairs through the real Workers runtime and SQLite quota persists across eviction', async () => {
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
  if (!entry) throw new Error('Не собран RouterAI Worker.');
  const name = 'routerai-routing-test';
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
                ...routerAiSettings,
                AI_DAILY_REQUEST_LIMIT: '6',
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
  async function send(body: unknown, mode: string, fallback = false) {
    const response = await runtime.dispatchFetch(
      routerAiSettings.SITE_ORIGIN + '/api/ai/' + mode,
      {
        method: 'POST',
        headers: {
          Origin: routerAiSettings.SITE_ORIGIN,
          'Content-Type': 'application/json',
          'X-AI-Provider': 'routerai',
          'X-Fixture-Fallback': String(fallback),
        },
        body: JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      models: response.headers.get('X-Fixture-Models'),
      calls: Number(response.headers.get('X-Fixture-Calls')),
      text: await response.text(),
    };
  }
  try {
    const health = await runtime.dispatchFetch(
      routerAiSettings.SITE_ORIGIN + '/api/ai/health',
    );
    expect(await health.json()).toEqual({
      enabled: true,
      provider: 'routerai',
    });
    const simple = await send(
      routerAiFeedback(1).input,
      'stream-feedback',
      true,
    );
    expect(simple.status).toBe(200);
    expect(simple.models).toBe(
      [
        routerAiSettings.AI_MODEL_SIMPLE,
        routerAiSettings.AI_MODEL_PRIMARY,
      ].join(','),
    );
    expect(simple.text).toContain('data: [DONE]');
    const standard = await send(
      routerAiFeedback(10).input,
      'stream-feedback',
      true,
    );
    expect(standard.status).toBe(200);
    expect(standard.models).toBe(
      [
        routerAiSettings.AI_MODEL_PRIMARY,
        routerAiSettings.AI_MODEL_FALLBACK,
      ].join(','),
    );
    expect((await send(programInput, 'part2-grade')).status).toBe(200);
    expect((await send(summaryInput, 'variant-summary')).status).toBe(200);
    await runtime.unsafeEvictDurableObject(name, 'AiQuota', {
      name: 'global-v1',
    });
    const exhausted = await send(routerAiFeedback(1).input, 'stream-feedback');
    expect(exhausted.status).toBe(503);
    expect(exhausted.calls).toBe(0);
    expect(JSON.parse(exhausted.text)).toMatchObject({
      error: { code: 'budget' },
    });
  } finally {
    await runtime.dispose();
  }
}, 20_000);
