import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { streamProbe } from '../fixtures/stream-probe';
import { runtimeSeeds } from '../fixtures/rng-source';

test('adaptive sessions and review queues match Node in the real Workers runtime', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'tests/fixtures/stream-worker.ts', formats: ['es'] },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  const script = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((output) => output.type === 'chunk')?.code;
  if (!script) throw new Error('Не собран Worker потока.');
  const worker = new Miniflare({
    workers: [
      {
        config: {
          name: 'stream-parity',
          compatibilityDate: '2026-10-01',
          manifest: {
            mainModule: 'worker.js',
            modules: { 'worker.js': { type: 'esm', contents: script } },
          },
        },
      },
    ],
  });
  try {
    const expected = runtimeSeeds.map(streamProbe);
    for (const session of expected) {
      expect(session.formatUnchanged).toBe(true);
      expect(session.roundTrip).toBe(true);
      expect(session.trace.some((item) => item.kind === 'review')).toBe(true);
      expect(session.completed).toBe(64);
    }
    const response = await worker.dispatchFetch('http://stream.test/', {
      method: 'POST',
      body: JSON.stringify(runtimeSeeds),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  } finally {
    await worker.dispose();
  }
}, 30000);
