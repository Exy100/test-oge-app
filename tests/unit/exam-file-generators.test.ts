import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  confirmedFileGenerators,
  confirmedFileSources,
} from '../../src/core/generators/exam/file-generators';
import {
  findReadingEvidence,
  readingConstruction,
  readingSources,
} from '../../src/core/generators/exam/reading-corpus';
import { selectedFilePaths } from '../../src/core/generators/exam/file-tree';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { checkGeneratorSeed } from '../../src/core/generators/quality';
import {
  verifyDataset,
  verifyArchive,
  type Dataset,
} from '../../src/core/datasets';
import { limits, readZip } from '../../src/core/datasets/zip';
import {
  readingOracle,
  selectionOracle,
  selectionOraclePaths,
} from '../fixtures/exam/solve-generated-files';
import type { Generator, TaskInstance } from '../../src/core/types';
import { shortFixtures } from '../fixtures/exam/short-answers';
import { sourceFiles } from '../fixtures/exam/solve-short';
import {
  TaskInstanceSchema,
  DatasetManifestSchema,
} from '../../src/core/schemas';
import { z } from '../../src/core/zod';

function check(
  generator: Generator,
  seed: string,
  dataset: Dataset,
  unpacked: ReadonlyMap<string, Uint8Array>,
): TaskInstance {
  return checkGeneratorSeed(generator, seed, {
    assertFiles(task) {
      expect(dataset.manifest.id).toBe(task.datasetId);
      expect(dataset.manifest.seed).toBe(seed);
      expect(dataset.manifest.files).toHaveLength(
        task.taskNumber === 11 ? 42 : 96,
      );
      expect(dataset.archive.length).toBeLessThan(limits.file); // can remain a child of a variant ZIP
      expect(dataset.archive.length).toBeGreaterThan(
        task.taskNumber === 11 ? 800_000 : 350_000,
      );
      for (const [path, bytes] of unpacked) {
        const source = dataset.files.get(path);
        if (!source) throw new Error('Source file missing');
        expect(Buffer.from(bytes).equals(Buffer.from(source))).toBe(true);
      }
      return [dataset.manifest];
    },
    assertUnique(task) {
      const value =
        task.taskNumber === 11
          ? readingOracle(task, unpacked)
          : selectionOracle(task, unpacked);
      expect(task.answer).toEqual(
        task.taskNumber === 11
          ? { type: 'word', value, caseSensitive: false }
          : { type: 'integer', value },
      );
    },
    assertQuality(task) {
      expect(task.examPart).toBe(2);
      expect(task.statement.length).toBeLessThan(900);
      expect(task.solution).toHaveLength(3);
      if (task.taskNumber === 12) {
        const folders = [...task.statement.matchAll(/^- (.+)$/gmu)].map(
          (match) => match[1] ?? '',
        );
        expect(folders.length).toBeGreaterThanOrEqual(2);
        expect(folders.length).toBeLessThanOrEqual(4);
        expect(
          selectionOraclePaths(unpacked, folders, [
            '.htm',
            '.tiff',
            '.pdf',
            '.jpeg',
          ]).length,
        ).toBeGreaterThanOrEqual(16);
      }
    },
  });
}
for (const generator of confirmedFileGenerators)
  describe(generator.id, () => {
    test.each([0, 1, 2, 3, 4])(
      '500-seed campaign, batch %i: actual files, ZIP, hashes, independent answer and determinism',
      async (batch) => {
        const seeds =
          fc.sample(
            fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
            { seed: 20261017, numRuns: 1 },
          )[0] ?? [];
        expect(seeds).toHaveLength(500);
        for (const seed of seeds.slice(batch * 100, (batch + 1) * 100)) {
          const task = generator.generate(seed),
            dataset = await createTaskDataset(task),
            unpacked = readZip(dataset.archive);
          await verifyDataset(dataset.manifest, unpacked);
          check(generator, seed, dataset, unpacked);
        }
      },
      30000,
    );
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden %s',
      async (seed) => {
        const dataset = await createTaskDataset(generator.generate(seed)),
          unpacked = readZip(dataset.archive);
        expect(check(generator, seed, dataset, unpacked)).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
      },
    );
    test('rejects changed question, answer, dataset identity and corrupted downloads', async () => {
      const task = generator.generate('negative');
      for (const changed of [
        { ...task, datasetId: 'wrong' },
        { ...task, statement: task.statement + ' Изменено.' },
        {
          ...task,
          difficulty: task.difficulty === 1 ? (2 as const) : (1 as const),
        },
        { ...task, answer: { type: 'integer' as const, value: '9999' } },
      ]) {
        expect(generator.verify(changed)).toBe(false);
        await expect(createTaskDataset(changed)).rejects.toThrow();
      }
      const dataset = await createTaskDataset(task),
        broken = dataset.archive.slice();
      broken[40] = (broken[40] ?? 0) ^ 1;
      await expect(verifyArchive(dataset.manifest, broken)).rejects.toThrow();
      const first = dataset.manifest.files[0];
      if (!first) throw new Error('Manifest entry missing');
      await expect(
        verifyDataset(
          {
            ...dataset.manifest,
            files: dataset.manifest.files.map((file, i) =>
              i === 0 ? { ...file, sha256: '0'.repeat(64) } : file,
            ),
          },
          dataset.files,
        ),
      ).rejects.toThrow();
    });
    test('fixed shared source collections are deterministic and isolated from caller mutations', async () => {
      const task = generator.generate('isolation'),
        original = await createTaskDataset(task),
        hash = createHash('sha256').update(original.archive).digest('hex');
      original.archive[0] = 0;
      for (const bytes of original.files.values()) bytes.fill(0);
      original.manifest.files.length = 0;
      const repeated = await createTaskDataset(task);
      expect(createHash('sha256').update(repeated.archive).digest('hex')).toBe(
        hash,
      );
      expect(repeated.manifest.files.length).toBe(
        task.taskNumber === 11 ? 42 : 96,
      );
      const source = confirmedFileSources(task);
      expect(source.map(({ path }) => path).sort()).toEqual(
        [...repeated.files.keys()].sort(),
      );
      for (const file of source)
        expect(
          Buffer.from(file.bytes).equals(
            Buffer.from(repeated.files.get(file.path) ?? []),
          ),
        ).toBe(true);
    });
  });
test('reading evidence is contextual, unique, author-scoped and sensitive to actual file content', () => {
  const { query } = readingConstruction('negative'),
    files = new Map(readingSources().map(({ path, bytes }) => [path, bytes])),
    hits = findReadingEvidence(files, query);
  expect(hits).toHaveLength(1);
  expect(
    findReadingEvidence(files, { ...query, author: 'Иной автор' }),
  ).toEqual([]);
  expect(
    findReadingEvidence(files, { ...query, episode: 'неизвестное событие' }),
  ).toEqual([]);
  const path = hits[0]?.path;
  if (!path) throw new Error('Context missing');
  const bytes = files.get(path);
  if (!bytes) throw new Error('Text missing');
  files.set(`Тексты/${query.author}/другая-копия.htm`, bytes);
  expect(findReadingEvidence(files, query)).toHaveLength(2);
  files.delete(path);
  files.delete(`Тексты/${query.author}/другая-копия.htm`);
  expect(findReadingEvidence(files, query)).toEqual([]);
});
test('directory traversal includes descendants, exact roots and extensions, without duplicate counting', () => {
  const files = new Map(
      [
        'Проза/а.htm',
        'Проза/вложенные/б.TIFF',
        'Проза/вложенные/а.htm',
        'Проза-архив/а.htm',
        'Проза/а.htm.backup',
        'README.txt',
      ].map((path) => [path, new Uint8Array()]),
    ),
    q = {
      folders: ['Проза', 'Проза/вложенные'],
      extensions: ['.htm', '.tiff'],
    };
  expect(selectedFilePaths(files, q)).toEqual(
    ['Проза/а.htm', 'Проза/вложенные/а.htm', 'Проза/вложенные/б.TIFF'].sort(),
  );
  expect(selectedFilePaths(files, q)).toEqual(
    selectionOraclePaths(files, q.folders, q.extensions),
  );
});
for (const fixture of shortFixtures)
  if (fixture.parameters.kind === 'file-selection')
    test(`${fixture.id}: actual official directory inventory with the same multi-root selection`, () => {
      const q = fixture.parameters;
      if (q.kind !== 'file-selection') throw new Error('Wrong fixture');
      const files = new Map(
        sourceFiles(fixture.year)
          .filter(({ path }) => path.startsWith('DEMO-12/'))
          .map(({ path }) => [path.slice('DEMO-12/'.length), new Uint8Array()]),
      );
      const selected = selectedFilePaths(files, q);
      expect(String(selected.length)).toBe(fixture.answers[0]);
      expect(selected).toEqual(
        selectionOraclePaths(files, q.folders, q.extensions),
      );
    });
test('difficulty and genuine question forms vary with actual reading distance and selection scope', () => {
  for (const generator of confirmedFileGenerators)
    expect(
      new Set(
        Array.from(
          { length: 100 },
          (_, i) => generator.generate(`difficulty:${String(i)}`).difficulty,
        ),
      ).size,
    ).toBeGreaterThan(1);
  expect(
    new Set(
      Array.from(
        { length: 100 },
        (_, i) => readingConstruction(String(i)).query.mode,
      ),
    ),
  ).toEqual(new Set(['nickname', 'role', 'character']));
});
for (const fixture of shortFixtures) {
  const parameters = fixture.parameters;
  if (parameters.kind === 'file-search')
    test(`${fixture.id}: generator produces the published kind of contextual question`, () => {
      const generator = confirmedFileGenerators.find(
        (entry) => entry.taskNumber === 11,
      );
      if (!generator) throw new Error('Reading generator missing');
      const seed = Array.from(
        { length: 100 },
        (_, i) => `official-format:${String(i)}`,
      ).find(
        (seed) => readingConstruction(seed).query.mode === parameters.response,
      );
      if (!seed) throw new Error('Published question kind not generated');
      const task = generator.generate(seed);
      expect(task.statement).toContain(
        {
          nickname: 'Как звали щенка',
          character: 'Какова фамилия',
          role: 'Кем работал',
        }[parameters.response],
      );
      expect(generator.verify(task)).toBe(true);
      expect(task.answer.type === 'word' && task.answer.value).toBe(
        readingOracle(
          task,
          new Map(readingSources().map(({ path, bytes }) => [path, bytes])),
        ),
      );
    });
}
test('committed file review tasks, manifests and shared ZIPs reproduce from their seeds', async () => {
  const root = new URL('../../docs/reviews/t3.15-files/', import.meta.url);
  const cases = z
    .array(
      z.strictObject({
        task: TaskInstanceSchema,
        archive: z.string().regex(/^(?:11|12)\/dataset\.zip$/u),
        manifest: z.string().regex(/^(?:11|12)\/[0-9]{2}\.manifest\.json$/u),
      }),
    )
    .length(20)
    .parse(JSON.parse(readFileSync(new URL('answers.json', root), 'utf8')));
  for (const entry of cases) {
    const generator = confirmedFileGenerators.find(
      ({ id }) => id === entry.task.generatorId,
    );
    if (!generator) throw new Error('Unknown review generator');
    expect(generator.generate(entry.task.seed)).toEqual(entry.task);
    const dataset = await createTaskDataset(entry.task);
    expect(
      readFileSync(new URL(entry.archive, root)).equals(
        Buffer.from(dataset.archive),
      ),
    ).toBe(true);
    const manifest = DatasetManifestSchema.parse(
      JSON.parse(readFileSync(new URL(entry.manifest, root), 'utf8')),
    );
    expect(manifest).toEqual(dataset.manifest);
  }
});
