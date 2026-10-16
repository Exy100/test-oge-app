import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { learningGeneratorsForTask as generatorsForTask } from './learning';
import { createTaskDataset } from './task-dataset';
import { checkGeneratorSeed } from './quality';
import {
  answerFromFiles,
  isSearchKind,
  searchSources,
} from './11/search-files';
import { readZip } from '../datasets/zip';
import { verifyArchive, type Dataset } from '../datasets';
import type { TaskInstance, Generator } from '../types';

function independent(
  task: TaskInstance,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const query = /«([^»]+)»/u.exec(task.statement)?.[1] ?? '';
  const entries = [...files].map(([path, bytes]) => ({
    path,
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  }));
  if (task.subtype === 'file-quote') {
    const matches = entries.filter(
      ({ path, text }) =>
        path.startsWith('reports/') && text.indexOf(query) >= 0,
    );
    expect(matches).toHaveLength(1);
    return matches[0]?.text.split('\n')[0]?.replace('Станция: ', '') ?? '';
  }
  if (task.subtype === 'file-word-count') {
    const text =
      entries.find((entry) => entry.path === 'texts/рассказ.txt')?.text ?? '';
    const tokens = text.match(/[А-ЯЁа-яё]+/gu) ?? [];
    return String(
      tokens.filter((token) => token.toUpperCase() === query.toUpperCase())
        .length,
    );
  }
  const [first, second] = query.toLowerCase().split(' ');
  return String(
    entries.filter(({ path, text }) => {
      if (!path.startsWith('reports/')) return false;
      const tokens = [...text.toLowerCase().matchAll(/[а-яё]+/gu)];
      return tokens.some((token, i) => {
        const next = tokens[i + 1];
        return (
          token[0] === first &&
          next?.[0] === second &&
          next !== undefined &&
          next.index === token.index + token[0].length + 1 &&
          text[token.index + token[0].length] === ' '
        );
      });
    }).length,
  );
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
        expect(Buffer.from(bytes).equals(Buffer.from(source))).toBe(true);
        expect(bytes.length).toBe(entry.size);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          entry.sha256,
        );
        expect(entry.license).toBe('CC0-1.0');
        expect(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        ).not.toContain('\0');
      }
      return [dataset.manifest];
    },
    assertUnique(task) {
      expect(task.answer).toMatchObject({ value: independent(task, unpacked) });
    },
    assertQuality(task) {
      expect(task.examPart).toBe(2);
      expect(task.solution).toHaveLength(3);
      for (const mistake of task.commonMistakes)
        if (task.answer.type !== 'artifact')
          expect(
            generator.verify({
              ...task,
              answer: { ...task.answer, value: mistake.answer },
            }),
          ).toBe(false);
    },
  });
}
for (const generator of generatorsForTask(11))
  describe(generator.id, () => {
    test('500 unique seeds: real ZIP bytes, hashes, independent search and determinism', async () => {
      const seeds =
        fc.sample(
          fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
          { seed: 20261014, numRuns: 1 },
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
          Buffer.from(again.archive).equals(Buffer.from(dataset.archive)),
        ).toBe(true);
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
    test('rejects wrong dataset identity, changed query and damaged archive', async () => {
      const task = generator.generate('invalid');
      expect(generator.verify({ ...task, datasetId: 'wrong' })).toBe(false);
      expect(
        generator.verify({
          ...task,
          statement: task.statement.replace(/«[^»]+»/u, '«Иная строка»'),
        }),
      ).toBe(false);
      await expect(
        createTaskDataset({ ...task, generatorId: 'other' }),
      ).rejects.toThrow();
      const dataset = await createTaskDataset(task);
      const broken = dataset.archive.slice();
      broken[40] = (broken[40] ?? 0) ^ 1;
      await expect(verifyArchive(dataset.manifest, broken)).rejects.toThrow();
      if (!isSearchKind(task.subtype)) throw new Error('Unknown subtype');
      expect([...dataset.files]).toEqual([
        ...searchSources(task.subtype, task.seed).files,
      ]);
    });
  });

test('word boundaries, case, exact spaces and file counting are explicit', () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const files = new Map([
    ['texts/рассказ.txt', encode('Маяк, маяк! МАЯК\nмаяка маяки маячный.')],
    ['reports/первый.txt', encode('ТИХИЙ БЕРЕГ. тихий берег!')],
    [
      'reports/второй.txt',
      encode('тихий  берег. тихий\nберег. тихий береговой участок.'),
    ],
    ['notes/чужой.txt', encode('маяк. тихий берег.')],
  ]);
  expect(answerFromFiles('file-word-count', 'маяк', files)).toBe('3');
  expect(answerFromFiles('file-phrase-documents', 'тихий берег', files)).toBe(
    '1',
  );
  expect(answerFromFiles('file-word-count', 'маяк', new Map())).toBeNull();
  const quote = new Map([
    ['reports/а.txt', encode('Станция: Северная\nЦитата.')],
    ['reports/б.txt', encode('Станция: Речная\nЦитата.')],
  ]);
  expect(answerFromFiles('file-quote', 'Цитата.', quote)).toBeNull();
  expect(answerFromFiles('file-quote', 'Отсутствует.', quote)).toBeNull();
  expect(() =>
    answerFromFiles(
      'file-word-count',
      'маяк',
      new Map([['texts/рассказ.txt', new Uint8Array([255])]]),
    ),
  ).toThrow();
});
