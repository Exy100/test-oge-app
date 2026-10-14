import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { generatorsForTask } from './index';
import { createTaskDataset } from './task-dataset';
import { checkGeneratorSeed } from './quality';
import {
  isSelectionKind,
  selectionMasks,
  selectionSources,
  selectionValue,
  wildcardMatch,
  type Condition,
} from './12/select-files';
import { readZip } from '../datasets/zip';
import { verifyArchive, type Dataset } from '../datasets';
import type { TaskInstance, Generator } from '../types';

/** Byte comparison; deep toEqual on large typed arrays is element-by-element and slow. */
const sameBytes = (left: Uint8Array, right: Uint8Array | undefined) =>
  right !== undefined && Buffer.compare(left, right) === 0;
function conditionOf(task: TaskInstance) {
  return {
    catalog: /в каталоге ([А-ЯЁа-яё]+)/u.exec(task.statement)?.[1] ?? '',
    extension: /расширением \.([a-z]+)/u.exec(task.statement)?.[1],
    mask: /маске `([^`]+)`/u.exec(task.statement)?.[1],
    kib: Number(/больше (\d+) Кбайт/u.exec(task.statement)?.[1] ?? 0),
  };
}
/** Third method: path segments of unpacked ZIP entries and a split-based mask. */
function independent(
  task: TaskInstance,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const { catalog, extension, mask, kib } = conditionOf(task);
  const inside = [...files]
    .map(([path, bytes]) => ({ parts: path.split('/'), size: bytes.length }))
    .filter(({ parts }) => parts[0] === catalog && parts.length > 1);
  expect(inside.length).toBeGreaterThan(0);
  const name = (parts: string[]) => parts[parts.length - 1] ?? '';
  if (task.subtype === 'file-mask-count') {
    const escape = (part: string) =>
      Array.from(part)
        .map((char) => `\\u{${char.codePointAt(0)?.toString(16) ?? ''}}`)
        .join('');
    const source = (mask ?? '')
      .split('*')
      .map((piece) => piece.split('?').map(escape).join('.'))
      .join('.*');
    const pattern = new RegExp(`^${source}$`, 'u');
    return String(
      inside.filter(({ parts }) => pattern.test(name(parts))).length,
    );
  }
  const typed = inside.filter(
    ({ parts }) => /\.([^.]+)$/u.exec(name(parts))?.[1] === extension,
  );
  if (task.subtype === 'file-size-count') {
    for (const { size } of typed)
      expect(size <= kib * 900 || size * 10 >= kib * 1024 * 11).toBe(true);
    return String(typed.filter(({ size }) => size > kib * 1024).length);
  }
  if (task.subtype === 'file-total-volume') {
    for (const { size } of typed) expect(size % 1024).toBe(0);
    return String(typed.reduce((sum, { size }) => sum + size, 0) / 1024);
  }
  return String(typed.length);
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
      expect(unpacked.has('README.txt')).toBe(true);
      for (const entry of dataset.manifest.files) {
        const bytes = unpacked.get(entry.path);
        const source = dataset.files.get(entry.path);
        if (!bytes || !source) throw new Error('Missing file');
        expect(sameBytes(bytes, source)).toBe(true);
        expect(bytes.length).toBe(entry.size);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          entry.sha256,
        );
        expect(entry.license).toBe('CC0-1.0');
        expect(entry.path.endsWith(`.${entry.format}`)).toBe(true);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        expect(text).not.toContain('\0');
        expect(text.endsWith('\n')).toBe(true);
        if (entry.format === 'json') {
          const parsed: unknown = JSON.parse(text);
          expect(parsed).toBeTypeOf('object');
        }
      }
      return [dataset.manifest];
    },
    assertUnique(task) {
      expect(task.answer).toMatchObject({ value: independent(task, unpacked) });
    },
    assertQuality(task) {
      expect(task.examPart).toBe(2);
      expect(task.solution).toHaveLength(3);
      expect(task.statement).toContain('Файлы вне каталога');
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
for (const generator of generatorsForTask(12))
  describe(generator.id, () => {
    test('500 unique seeds: real ZIP bytes, hashes, independent selection and determinism', async () => {
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
        expect(sameBytes(again.archive, dataset.archive)).toBe(true);
      }
    }, 60000);
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden %s',
      async (seed) => {
        const dataset = await createTaskDataset(generator.generate(seed));
        expect(check(generator, seed, dataset)).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
      },
    );
    test('rejects wrong dataset identity, changed condition and damaged archive', async () => {
      const task = generator.generate('invalid');
      expect(generator.verify({ ...task, datasetId: 'wrong' })).toBe(false);
      expect(
        generator.verify({
          ...task,
          statement: task.statement.replace(
            /в каталоге [А-ЯЁа-яё]+/gu,
            'в каталоге Иной',
          ),
        }),
      ).toBe(false);
      expect(
        generator.verify({
          ...task,
          statement: task.statement
            .replace(/маске `[^`]+`/u, 'маске `*.*`')
            .replace(/расширением \.[a-z]+/u, 'расширением .zip')
            .replace(/больше \d+ Кбайт/u, 'больше 100 Кбайт'),
        }),
      ).toBe(false);
      expect(
        generator.verify({
          ...task,
          answer: { type: 'word', value: '1', caseSensitive: false },
        }),
      ).toBe(false);
      await expect(
        createTaskDataset({ ...task, generatorId: 'other' }),
      ).rejects.toThrow();
      await expect(
        createTaskDataset({ ...task, taskNumber: 11 }),
      ).rejects.toThrow();
      const dataset = await createTaskDataset(task);
      const broken = dataset.archive.slice();
      broken[40] = (broken[40] ?? 0) ^ 1;
      await expect(verifyArchive(dataset.manifest, broken)).rejects.toThrow();
      if (!isSelectionKind(task.subtype)) throw new Error('Unknown subtype');
      const sources = selectionSources(task.subtype, task.seed).files;
      expect([...dataset.files.keys()]).toEqual([...sources.keys()]);
      for (const [path, bytes] of sources)
        expect(sameBytes(bytes, dataset.files.get(path))).toBe(true);
    });
  });

test('Python zipfile, fnmatch and stdlib parsers agree with every subtype', async () => {
  const cases: Record<string, unknown>[] = [];
  const answers: string[] = [];
  for (const generator of generatorsForTask(12))
    for (let index = 0; index < 125; index++) {
      const task = generator.generate(`python-${String(index)}`);
      const dataset = await createTaskDataset(task);
      if (task.answer.type !== 'integer') throw new Error('Expected integer');
      const { catalog, extension, mask, kib } = conditionOf(task);
      cases.push({
        zip: Buffer.from(dataset.archive).toString('base64'),
        kind: task.subtype,
        catalog,
        extension,
        mask,
        kib,
      });
      answers.push(task.answer.value);
    }
  const result = spawnSync(
    'python3',
    ['-I', 'tests/fixtures/check-file-selection.py'],
    {
      input: JSON.stringify(cases),
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(answers);
}, 60000);

test('wildcard matcher agrees with an independent regular expression', () => {
  const symbols = ['а', 'б', '.', '-', '1'];
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...symbols, '*', '?'), { maxLength: 7 }),
      fc.array(fc.constantFrom(...symbols), { maxLength: 8 }),
      (mask, name) => {
        const source = mask
          .map((char) =>
            char === '*'
              ? '.*'
              : char === '?'
                ? '.'
                : char === '.'
                  ? '\\.'
                  : char,
          )
          .join('');
        expect(wildcardMatch(mask.join(''), name.join(''))).toBe(
          new RegExp(`^${source}$`, 'u').test(name.join('')),
        );
      },
    ),
    { seed: 20261015, numRuns: 2000 },
  );
  expect(wildcardMatch('урок?.*', 'урок1.txt')).toBe(true);
  expect(wildcardMatch('урок?.*', 'урок.txt')).toBe(false);
  expect(wildcardMatch('урок?.*', 'урок10.txt')).toBe(false);
  expect(wildcardMatch('*-2025.csv', '-2025.csv')).toBe(true);
  expect(wildcardMatch('?а*.py', 'сумма.py')).toBe(false);
});

test('every mask has matching, near-miss and unrelated names in generated data', () => {
  const seen = new Set<string>();
  for (let index = 0; index < 200; index++) {
    const { condition, files } = selectionSources(
      'file-mask-count',
      `masks-${String(index)}`,
    );
    if (condition.kind !== 'file-mask-count') throw new Error('Wrong kind');
    seen.add(condition.mask);
    const names = [...files.keys()]
      .filter((path) => path.startsWith(`${condition.catalog}/`))
      .map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(names.some((name) => wildcardMatch(condition.mask, name))).toBe(
      true,
    );
    expect(
      names.some(
        (name) =>
          wildcardMatch(condition.near, name) &&
          !wildcardMatch(condition.mask, name),
      ),
    ).toBe(true);
    expect(names.some((name) => !wildcardMatch(condition.near, name))).toBe(
      true,
    );
  }
  expect([...seen].sort()).toEqual(
    selectionMasks.map(({ mask }) => mask).sort(),
  );
});

test('scopes, extensions, size margins and whole kilobytes are explicit', () => {
  const encode = (size: number) => new Uint8Array(size).fill(0x61);
  const files = new Map([
    ['Проекты/итоги.txt', encode(4000)],
    ['Проекты/Данные/план.txt', encode(1000)],
    ['Проекты/Данные/2025/список.txt.csv', encode(5000)],
    ['Проекты-архив/идеи.txt', encode(6000)],
    ['Загрузки/вопросы.txt', encode(7000)],
  ]);
  const extension: Condition = {
    kind: 'file-extension-count',
    catalog: 'Проекты',
    extension: 'txt',
  };
  expect(selectionValue(extension, files)).toBe('2');
  expect(selectionValue(extension, files, { scope: 'direct' })).toBe('1');
  expect(selectionValue(extension, files, { scope: 'prefix' })).toBe('3');
  expect(selectionValue({ ...extension, extension: 'csv' }, files)).toBe('1');
  expect(selectionValue({ ...extension, catalog: 'Нет' }, files)).toBeNull();
  const size: Condition = {
    kind: 'file-size-count',
    catalog: 'Проекты',
    extension: 'txt',
    kib: 3,
  };
  expect(selectionValue(size, files)).toBe('1');
  expect(selectionValue(size, files, { ignoreSize: true })).toBe('2');
  // 2900 bytes is below 3 KiB but above 3 decimal kB: rounding mode would matter.
  expect(
    selectionValue(
      size,
      new Map([...files, ['Проекты/Данные/заметки.txt', encode(2900)]]),
    ),
  ).toBeNull();
  const volume: Condition = {
    kind: 'file-total-volume',
    catalog: 'Проекты',
    extension: 'json',
  };
  const whole = new Map([
    ['Проекты/карта.json', encode(2048)],
    ['Проекты/Данные/маршрут.json', encode(3072)],
  ]);
  expect(selectionValue(volume, whole)).toBe('5');
  expect(selectionValue(volume, whole, { scope: 'direct' })).toBe('2');
  expect(
    selectionValue(
      volume,
      new Map([...whole, ['Проекты/словарь.json', encode(1000)]]),
    ),
  ).toBeNull();
  const mask: Condition = {
    kind: 'file-mask-count',
    catalog: 'Проекты',
    mask: 'отчёт-??.txt',
    near: 'отчёт-*.txt',
  };
  const reports = new Map([
    ['Проекты/отчёт-01.txt', encode(10)],
    ['Проекты/Данные/отчёт-7.txt', encode(10)],
    ['Проекты/Данные/отчёт-12.csv', encode(10)],
    ['Проекты/отчёт-123.txt', encode(10)],
  ]);
  expect(selectionValue(mask, reports)).toBe('1');
  expect(selectionValue(mask, reports, { mask: mask.near })).toBe('3');
  expect(selectionValue(mask, reports, { mask: 'отчёт-+.txt' })).toBeNull();
});
