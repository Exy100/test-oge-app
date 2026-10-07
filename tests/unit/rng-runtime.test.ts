import { expect, test } from 'vitest';
import { Miniflare } from 'miniflare';
import { Rng } from '../../src/core/rng';
import { rngProbe } from '../fixtures/rng-probe';
import { rngRuntimeSource, runtimeSeeds } from '../fixtures/rng-source';

test('Node and the real Workers runtime produce identical results', async () => {
  const worker = new Miniflare({
    workers: [
      {
        config: {
          name: 'rng-parity',
          compatibilityDate: '2026-10-01',
          manifest: {
            mainModule: 'worker.js',
            modules: {
              'rng.js': { type: 'esm', contents: rngRuntimeSource() },
              'worker.js': {
                type: 'esm',
                contents: `import { Rng, rngProbe } from "./rng.js";
          export default { async fetch(request) {
            const seeds = await request.json();
            return Response.json(seeds.map(seed => rngProbe(new Rng(seed))));
          } };`,
              },
            },
          },
        },
      },
    ],
  });
  try {
    const response = await worker.dispatchFetch('http://rng.test/', {
      method: 'POST',
      body: JSON.stringify(runtimeSeeds),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      runtimeSeeds.map((seed) => rngProbe(new Rng(seed))),
    );
  } finally {
    await worker.dispose();
  }
}, 20_000);
