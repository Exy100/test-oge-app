import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { learningGeneratorsForTask as generatorsForTask } from './learning';
import { createTaskDataset } from './task-dataset';
import { checkGeneratorSeed } from './quality';
import { matchesMask, selectFiles } from './12/select-files';
import { readZip } from '../datasets/zip';
import { verifyArchive, type Dataset } from '../datasets';
import type { Generator, TaskInstance } from '../types';

// A third algorithm: recursively consume the filename and wildcard characters.
function wildcard(name: string, mask: string): boolean {
  if (!mask) return !name;
  if (mask[0] === '*')
    return (
      wildcard(name, mask.slice(1)) || (!!name && wildcard(name.slice(1), mask))
    );
  return (
    !!name &&
    (mask[0] === '?' || mask[0] === name[0]) &&
    wildcard(name.slice(1), mask.slice(1))
  );
}
function oracle(
  task: TaskInstance,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const folder = /Рассматривай папку (\w+),/u.exec(task.statement)?.[1];
  const mask = /Маска имени файла: `«([^»]+)»`/u.exec(task.statement)?.[1];
  const minimum = /Минимальный размер: (\d+) байт/u.exec(task.statement)?.[1];
  if (!folder || !mask || minimum === undefined)
    throw new Error('Missing selection parameters');
  const sizes = [...files]
    .filter(([path, bytes]) => {
      const parts = path.split('/');
      return (
        parts[0] === folder &&
        (task.statement.includes('включая все вложенные папки') ||
          parts.length === 2) &&
        wildcard(parts.at(-1) ?? '', mask) &&
        bytes.length >= Number(minimum)
      );
    })
    .map(([, bytes]) => bytes.length)
    .sort((a, b) => a - b);
  expect(sizes.length).toBeGreaterThan(0);
  if (task.subtype === 'file-mask-count') return String(sizes.length);
  if (task.subtype === 'file-largest') return String(sizes.at(-1));
  let total = 0;
  for (const size of sizes) total += size;
  expect(total % 1024).toBe(0);
  return String(total / 1024);
}
function check(
  generator: Generator,
  seed: string,
  dataset: Dataset,
): TaskInstance {
  const unpacked = readZip(dataset.archive);
  return checkGeneratorSeed(generator, seed, {
    assertFiles(task) {
      expect(dataset.manifest.id).toBe(task.datasetId);
      expect(dataset.manifest.seed).toBe(seed);
      expect([...unpacked.keys()].sort()).toEqual(
        [...dataset.files.keys()].sort(),
      );
      for (const entry of dataset.manifest.files) {
        const bytes = unpacked.get(entry.path);
        const source = dataset.files.get(entry.path);
        if (!bytes || !source) throw new Error('Missing file');
        expect(Buffer.compare(Buffer.from(bytes), Buffer.from(source))).toBe(0);
        expect(bytes.length).toBe(entry.size);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          entry.sha256,
        );
        expect(entry.license).toBe('CC0-1.0');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        expect(text).not.toContain('\0');
        if (entry.path !== 'README.txt') expect(bytes.length % 1024).toBe(0);
        if (entry.format === 'csv') {
          expect(text.startsWith('record;value\n')).toBe(true);
          expect(
            text
              .trimEnd()
              .split('\n')
              .every((row) => row.split(';').length === 2),
          ).toBe(true);
        }
      }
      return [dataset.manifest];
    },
    assertUnique(task) {
      expect(task.answer).toEqual({
        type: 'integer',
        value: oracle(task, unpacked),
      });
    },
    assertQuality(task) {
      expect(task.examPart).toBe(2);
      expect(task.solution).toHaveLength(3);
      for (const mistake of task.commonMistakes)
        expect(
          generator.verify({
            ...task,
            answer: { type: 'integer', value: mistake.answer },
          }),
        ).toBe(false);
    },
  });
}
for (const generator of generatorsForTask(12))
  describe(generator.id, () => {
    test('500 distinct seeds: actual files, ZIP, SHA-256, independent answer and repeatability', async () => {
      const seeds =
        fc.sample(
          fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
          { seed: 20261015, numRuns: 1 },
        )[0] ?? [];
      expect(seeds).toHaveLength(500);
      for (const seed of seeds) {
        const task = generator.generate(seed);
        const dataset = await createTaskDataset(task);
        await verifyArchive(dataset.manifest, dataset.archive);
        check(generator, seed, dataset);
        const again = await createTaskDataset(task);
        expect(again.manifest).toEqual(dataset.manifest);
        expect(
          Buffer.compare(
            Buffer.from(again.archive),
            Buffer.from(dataset.archive),
          ),
        ).toBe(0);
      }
    }, 30000);
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden %s',
      async (seed) => {
        const dataset = await createTaskDataset(generator.generate(seed));
        expect(check(generator, seed, dataset)).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
      },
    );
    test('rejects altered scope, units, threshold, answer and dataset identity', async () => {
      const task = generator.generate('negative');
      for (const statement of [
        task.statement.replace('папку ', 'папку other_'),
        task.statement.replace('байт включительно', 'байт исключительно'),
        task.statement.replace('в байтах', 'в битах') + ' Изменено.',
      ])
        expect(generator.verify({ ...task, statement })).toBe(false);
      expect(generator.verify({ ...task, datasetId: 'other' })).toBe(false);
      expect(
        generator.verify({
          ...task,
          answer: { type: 'word', value: 'wrong', caseSensitive: false },
        }),
      ).toBe(false);
      await expect(
        createTaskDataset({ ...task, taskNumber: 11 }),
      ).rejects.toThrow();
      await expect(
        createTaskDataset({ ...task, datasetId: 'other' }),
      ).rejects.toThrow();
      const dataset = await createTaskDataset(task);
      const broken = dataset.archive.slice();
      broken[50] = (broken[50] ?? 0) ^ 1;
      await expect(verifyArchive(dataset.manifest, broken)).rejects.toThrow();
    });
  });

test.each([
  ['note_a.txt', 'note_?.txt', true],
  ['note_ab.txt', 'note_?.txt', false],
  ['note_.txt', 'note_*.txt', true],
  ['note_A.txt', 'note_a.txt', false],
  ['note_aXtxt', 'note_a.txt', false],
  ['a+b.txt', 'a+b.*', true],
  ['abc', '*?*', true],
  ['', '*', true],
  ['', '?', false],
])('mask %s / %s = %s', (name, mask, expected) => {
  expect(matchesMask(name, mask)).toBe(expected);
});

test('selection uses whole directory segments, inclusive byte bounds and basename-only masks', () => {
  const files = new Map([
    ['project/a.txt', new Uint8Array(1024)],
    ['project/old/a.txt', new Uint8Array(2048)],
    ['project/b.txt', new Uint8Array(1023)],
    ['project/b.csv', new Uint8Array(4096)],
    ['project-other/a.txt', new Uint8Array(4096)],
    ['archive/a.txt', new Uint8Array(4096)],
    ['README.txt', new Uint8Array(4096)],
  ]);
  const rule = {
    folder: 'project',
    recursive: true,
    mask: '*.txt',
    minimum: 1024,
  };
  expect(selectFiles(files, rule).map(([path]) => path)).toEqual([
    'project/a.txt',
    'project/old/a.txt',
  ]);
  expect(
    selectFiles(files, { ...rule, recursive: false }).map(([path]) => path),
  ).toEqual(['project/a.txt']);
  expect(selectFiles(files, { ...rule, mask: 'old/*' })).toEqual([]);
});
