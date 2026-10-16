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
import { confirmedShortGenerators } from '../../src/core/generators/exam/short-generators';
import { confirmedFileGenerators } from '../../src/core/generators/exam/file-generators';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { sha256 } from '../../src/core/datasets';
import { runtimeSeeds } from '../fixtures/rng-source';
import {
  buildVariant,
  buildFixedVariant,
  fixedVariants,
} from '../../src/core/variants';

test('current and confirmed exam generators reproduce complete tasks and files in Workers', async () => {
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
  const chunks = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Не собран Worker.');
  const worker = new Miniflare({
    workers: [
      {
        config: {
          name: 'generator-parity',
          compatibilityDate: '2026-10-01',
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
    const confirmed = await worker.dispatchFetch(
      'http://worker.local/confirmed-exam',
      { method: 'POST', body: JSON.stringify(runtimeSeeds.slice(0, 3)) },
    );
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual(
      await Promise.all(
        [...confirmedShortGenerators, ...confirmedFileGenerators].map(
          (generator) =>
            Promise.all(
              runtimeSeeds.slice(0, 3).map(async (seed) => {
                const task = generator.generate(seed),
                  dataset = task.datasetId
                    ? await createTaskDataset(task)
                    : undefined;
                return {
                  task,
                  verified: true,
                  ...(dataset
                    ? {
                        manifest: dataset.manifest,
                        archiveSha256: await sha256(dataset.archive),
                      }
                    : {}),
                };
              }),
            ),
        ),
      ),
    );
    const variants = await worker.dispatchFetch(
      'http://worker.local/variants',
      { method: 'POST', body: JSON.stringify(runtimeSeeds.slice(0, 3)) },
    );
    expect(variants.status).toBe(200);
    expect(await variants.json()).toEqual({
      fixed: fixedVariants.map((item) => ({
        presentation: buildFixedVariant(item.id),
        document: buildFixedVariant(item.id, 'document'),
      })),
      generated: runtimeSeeds.slice(0, 3).map((seed) => ({
        presentation: buildVariant(seed),
        document: buildVariant(seed, 'document'),
      })),
    });
  } finally {
    await worker.dispose();
  }
}, 30000);
