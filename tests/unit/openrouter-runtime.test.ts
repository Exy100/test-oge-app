import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import {
  routerEnv,
  feedbackInput,
  programInput,
  officeInput,
  summaryInput,
  programGrade,
  officeGrade,
} from '../fixtures/openrouter-data';

test('actual Workers runtime streams two modes, falls back, validates JSON and keeps HTTP guards', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'tests/fixtures/openrouter-worker.ts', formats: ['es'] },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  const chunks = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Не собран Worker проверки транспорта.');
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'openrouter-transport-test',
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
        },
      },
    ],
  });
  try {
    for (const [mode, input, scenario, expected, calls] of [
      ['stream-feedback', feedbackInput, 'fallback', null, 2],
      ['variant-summary', summaryInput, '', null, 1],
      ['part2-grade', programInput, '', programGrade, 1],
      ['part2-grade', officeInput, 'office', officeGrade, 1],
    ] as const) {
      const response = await runtime.dispatchFetch(
        routerEnv.SITE_ORIGIN + '/api/ai/' + mode + '?scenario=' + scenario,
        {
          method: 'POST',
          headers: {
            Origin: routerEnv.SITE_ORIGIN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Fixture-Calls')).toBe(String(calls));
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      if (expected) expect(await response.json()).toEqual(expected);
      else
        expect(await response.text()).toBe(
          'data: {"delta":"Привет, ученик!"}\n\ndata: [DONE]\n\n',
        );
    }
    const invalid = await runtime.dispatchFetch(
      routerEnv.SITE_ORIGIN + '/api/ai/part2-grade?scenario=invalid',
      {
        method: 'POST',
        headers: {
          Origin: routerEnv.SITE_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(programInput),
      },
    );
    expect(invalid.status).toBe(502);
    expect(invalid.headers.get('X-Fixture-Calls')).toBe('2');
    expect(await invalid.json()).toEqual({
      error: {
        code: 'invalid-response',
        message: 'Не удалось получить корректный разбор.',
      },
    });
    const denied = await runtime.dispatchFetch(
      routerEnv.SITE_ORIGIN + '/api/ai/stream-feedback',
      {
        method: 'POST',
        headers: {
          Origin: 'https://foreign.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackInput),
      },
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('X-Fixture-Calls')).toBe('0');
    for (const scenario of ['cancel-body', 'cancel-request']) {
      const response = await runtime.dispatchFetch(
        routerEnv.SITE_ORIGIN + '/api/ai/stream-feedback?scenario=' + scenario,
        {
          method: 'POST',
          headers: {
            Origin: routerEnv.SITE_ORIGIN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(feedbackInput),
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ aborted: 1, cancelled: 1 });
    }
  } finally {
    await runtime.dispose();
  }
}, 20_000);
