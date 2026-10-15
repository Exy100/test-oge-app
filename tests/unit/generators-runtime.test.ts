import {
  isSelectionKind,
  selectionSources,
} from '../../src/core/generators/12/select-files';
import {
  isSearchKind,
  searchSources,
} from '../../src/core/generators/11/search-files';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { generators } from '../../src/core/generators';
import { runtimeSeeds } from '../fixtures/rng-source';

test('all generator subtypes reproduce complete tasks in Workers', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'tests/fixtures/generator-worker.ts', formats: ['es'] },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  const script = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((output) => output.type === 'chunk')?.code;
  if (!script) throw new Error('Не собран Worker.');
  const worker = new Miniflare({
    workers: [
      {
        config: {
          name: 'generator-parity',
          compatibilityDate: '2026-10-01',
          manifest: {
            mainModule: 'worker.js',
            modules: {
              'worker.js': { type: 'esm', contents: script },
            },
          },
        },
      },
    ],
  });
  try {
    const response = await worker.dispatchFetch('http://worker.local/', {
      method: 'POST',
      body: JSON.stringify(runtimeSeeds),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      generators.map((generator) =>
        runtimeSeeds.map((seed) => ({
          task: generator.generate(seed),
          verified: true,
          files: isSearchKind(generator.subtype)
            ? [...searchSources(generator.subtype, seed).files].map(
                ([path, bytes]) => [path, Array.from(bytes)],
              )
            : isSelectionKind(generator.subtype)
              ? [...selectionSources(generator.subtype, seed).files].map(
                  ([path, bytes]) => [path, Array.from(bytes)],
                )
              : [],
        })),
      ),
    );
  } finally {
    await worker.dispose();
  }
}, 30000);
