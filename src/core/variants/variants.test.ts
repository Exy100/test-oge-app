import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { bankTasks } from '../banks';
import { generators, getGenerator } from '../generators';
import { createTaskDataset } from '../generators/task-dataset';
import { VariantSchema } from '../schemas';
import { scoreVariant } from '../scoring';
import { readZip } from '../datasets/zip';
import { verifyArchive } from '../datasets';
import type { Variant } from '../types';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
  selectedVariant13,
  variant13Alternatives,
  variantFileKey,
  variantFileTasks,
  variantSeed,
  type Variant13Choice,
} from './index';
import { createVariantDataset, validateBuiltVariant } from './dataset';
import { variantMarkdown } from './sample';

const seeds =
  fc.sample(fc.uniqueArray(fc.string(), { minLength: 1000, maxLength: 1000 }), {
    seed: 20261015,
    numRuns: 1,
  })[0] ?? [];
const selections: readonly Variant13Choice[] = ['presentation', 'document'];
function expectBytes(
  actual: Uint8Array | undefined,
  expected: Uint8Array,
): void {
  expect(
    actual !== undefined && Buffer.from(actual).equals(Buffer.from(expected)),
  ).toBe(true);
}
function checkComposition(variant: Variant, selection: Variant13Choice): void {
  expect(VariantSchema.parse(variant)).toEqual(variant);
  expect(variant.tasks.map((task) => task.taskNumber)).toEqual(
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
  expect(new Set(variant.tasks.map((task) => task.id)).size).toBe(16);
  expect(variant.tasks.map((task) => task.criteria?.max ?? 1)).toEqual([
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 2, 2,
  ]);
  expect(
    variant.tasks.reduce((sum, task) => sum + (task.criteria?.max ?? 1), 0),
  ).toBe(21);
  expect(variant.tasks.filter((task) => task.taskNumber === 13)).toHaveLength(
    1,
  );
  expect(selectedVariant13(variant)).toBe(selection);
  for (const task of variant.tasks) {
    if (task.taskNumber === 13) expect(bankTasks).toContainEqual(task);
    else expect(getGenerator(task.generatorId).verify(task)).toBe(true);
    expect(Boolean(task.datasetId)).toBe(task.taskNumber >= 11);
  }
}
test.each([0, 1, 2, 3])(
  '1000 distinct seeds, batch %i: both №13 choices, deterministic tasks and scores',
  (batch) => {
    expect(seeds).toHaveLength(1000);
    expect(new Set(seeds).size).toBe(1000);
    const used = new Set<string>();
    for (const seed of seeds.slice(batch * 250, (batch + 1) * 250)) {
      const presentation = buildVariant(seed),
        document = buildVariant(seed, 'document');
      for (const task of presentation.tasks) used.add(task.generatorId);
      checkComposition(presentation, 'presentation');
      checkComposition(document, 'document');
      expect(buildVariant(seed)).toEqual(presentation);
      expect(document.tasks.filter((task) => task.taskNumber !== 13)).toEqual(
        presentation.tasks.filter((task) => task.taskNumber !== 13),
      );
      expect(
        new Set(
          presentation.tasks
            .filter((task) => task.taskNumber !== 13)
            .map((task) => task.seed),
        ).size,
      ).toBe(15);
    }
    for (const generator of generators)
      expect(used.has(generator.id), generator.id).toBe(true);
  },
  30000,
);
test('fixed IDs and seeds are unique, reproducible and protected from mutation', () => {
  expect(fixedVariants.map((item) => item.id)).toEqual(
    Array.from({ length: 10 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`),
  );
  expect(new Set(fixedVariants.map((item) => item.seed)).size).toBe(10);
  expect(Object.isFrozen(fixedVariants)).toBe(true);
  for (const item of fixedVariants) {
    expect(Object.isFrozen(item)).toBe(true);
    const fixed = buildFixedVariant(item.id);
    expect(fixed.kind).toBe('fixed');
    expect(variantSeed(fixed)).toBe(item.seed);
    expect(fixed.tasks).toEqual(buildVariant(item.seed).tasks);
    expect(buildFixedVariant(item.id)).toEqual(fixed);
  }
  expect(buildVariant('first')).not.toEqual(buildVariant('second'));
  expect(buildVariant('')).toEqual(buildVariant(''));
  expect(() => buildVariant('x', 'both' as never)).toThrow();
  expect(() => buildVariant(1 as never)).toThrow();
  expect(() => buildFixedVariant('V11')).toThrow();
  expect(() => variantSeed({ kind: 'fixed', id: 'V11', tasks: [] })).toThrow();
  expect(() =>
    selectedVariant13({ kind: 'fixed', id: 'V01', tasks: [] }),
  ).toThrow();
  const original = JSON.stringify(bankTasks),
    variant = buildVariant('isolation');
  const task = variant.tasks.find((item) => item.taskNumber === 13);
  if (!task) throw new Error('Missing №13');
  task.statement = 'changed';
  if (task.solution[0]) task.solution[0].text = 'changed';
  expect(JSON.stringify(bankTasks)).toBe(original);
  expect(
    buildVariant('isolation').tasks.find((item) => item.taskNumber === 13)
      ?.statement,
  ).not.toBe('changed');
});
test.each(selections)(
  'real scoring includes only the selected %s task',
  (selection) => {
    for (const item of fixedVariants) {
      const variant = buildFixedVariant(item.id, selection);
      checkComposition(variant, selection);
      const answers = variant.tasks.flatMap((task) =>
        task.answer.type !== 'artifact'
          ? [{ taskId: task.id, answer: task.answer.value }]
          : [],
      );
      const practice = variant.tasks.flatMap((task) =>
        task.answer.type === 'artifact'
          ? [
              {
                taskId: task.id,
                kind: task.answer.kind,
                criteriaAnswers: [],
                selfAssessment: task.criteria?.max,
                ...(task.answer.kind === 'robot' ||
                task.answer.kind === 'program'
                  ? { code: '', localRuns: [] }
                  : {}),
              },
            ]
          : [],
      );
      const result = scoreVariant(variant, { answers, practice });
      expect(result).toMatchObject({
        complete: true,
        primaryScore: 21,
        maxScore: 21,
      });
      expect(result.rows.map((row) => row.taskNumber)).toEqual(
        Array.from({ length: 16 }, (_, i) => i + 1),
      );
      expect(scoreVariant(variant, { answers, practice: [] })).toMatchObject({
        complete: false,
        knownScore: 12,
        pendingTaskNumbers: [13, 14, 15, 16],
      });
      const other = variant13Alternatives(item.seed)[
        selection === 'presentation' ? 'document' : 'presentation'
      ];
      expect(() =>
        scoreVariant(variant, {
          answers,
          practice: [
            ...practice,
            {
              taskId: other.id,
              kind: selection === 'presentation' ? 'document' : 'presentation',
              criteriaAnswers: [],
              selfAssessment: 2,
            },
          ],
        }),
      ).toThrow('Практическая работа не соответствует');
    }
  },
);
test.each(['golden-1', 'golden-2', 'Пример 🧩'])(
  'golden generated variant %s with both alternatives',
  (seed) => {
    for (const selection of selections)
      expect(buildVariant(seed, selection)).toMatchSnapshot();
    expect(variant13Alternatives(seed)).toMatchSnapshot();
  },
);
describe.each(fixedVariants)('$id complete files', (fixed) => {
  test.each(selections)(
    '%s: real nested archives, hashes, source references and exact reproduction',
    async (selection) => {
      const variant = buildFixedVariant(fixed.id, selection),
        dataset = await createVariantDataset(variant),
        files = readZip(dataset.archive),
        tasks = variantFileTasks(variant);
      expect([...files.keys()].sort()).toEqual(
        [...dataset.files.keys()].sort(),
      );
      for (const [path, bytes] of dataset.files)
        expectBytes(files.get(path), bytes);
      expect(files.size).toBe(19);
      expect(tasks.map((task) => variantFileKey(task))).toEqual([
        '11',
        '12',
        '13-presentation',
        '13-document',
        '14',
        '15',
        '16',
      ]);
      expect(
        JSON.parse(new TextDecoder().decode(files.get('variant.json'))),
      ).toEqual(variant);
      expect(
        JSON.parse(new TextDecoder().decode(files.get('alternatives13.json'))),
      ).toEqual(variant13Alternatives(fixed.seed));
      for (const file of dataset.manifest.files) {
        const data = files.get(file.path);
        if (!data) throw new Error('Missing package file');
        expect(createHash('sha256').update(data).digest('hex')).toBe(
          file.sha256,
        );
        expect(file.license).toBe('CC0-1.0');
      }
      for (const task of tasks) {
        const key = variantFileKey(task),
          bytes = files.get(`files/${key}.zip`),
          manifestBytes = files.get(`files/${key}.manifest.json`);
        if (!bytes || !manifestBytes) throw new Error('Missing task archive');
        const manifest: unknown = JSON.parse(
          new TextDecoder().decode(manifestBytes),
        );
        const validated = await verifyArchive(manifest, bytes),
          expected = await createTaskDataset(task);
        expect(validated.id).toBe(task.datasetId);
        expectBytes(bytes, expected.archive);
        expect(validated).toEqual(expected.manifest);
      }
      expectBytes(
        (await createVariantDataset(JSON.parse(JSON.stringify(variant))))
          .archive,
        dataset.archive,
      );
      if (selection === 'presentation') {
        expectBytes(
          await readFile(`samples/variants/${fixed.id}/dataset.zip`),
          dataset.archive,
        );
        expect(
          JSON.parse(
            await readFile(
              `samples/variants/${fixed.id}/manifest.json`,
              'utf8',
            ),
          ),
        ).toEqual(dataset.manifest);
      }
      expect(variantMarkdown(variant).match(/^## Задание №/gmu)).toHaveLength(
        16,
      );
      expect(variantMarkdown(variant)).toContain('### 13.1');
      expect(variantMarkdown(variant)).toContain('### 13.2');
    },
    30000,
  );
});
test('choice changes review metadata while all seven underlying archives stay identical', async () => {
  const left = await createVariantDataset(buildVariant('branch-files')),
    right = await createVariantDataset(
      buildVariant('branch-files', 'document'),
    );
  for (const [path, bytes] of left.files)
    if (path.startsWith('files/')) expectBytes(right.files.get(path), bytes);
  expect(left.manifest.id).not.toBe(right.manifest.id);
  expect(Buffer.from(left.archive).equals(Buffer.from(right.archive))).toBe(
    false,
  );
});
test.each(['', 'Пример 🧩', 'golden-3'])(
  'generated package manifest %s',
  async (seed) => {
    const variant = buildVariant(seed),
      dataset = await createVariantDataset(variant);
    expect(dataset.manifest).toMatchSnapshot();
    expect(validateBuiltVariant(variant)).toEqual(variant);
    expectBytes((await createVariantDataset(variant)).archive, dataset.archive);
  },
);
test('export rejects mismatched seeds, IDs, tasks, maxima and extra alternatives in the scored array', async () => {
  const variant = buildVariant('negative'),
    other = buildVariant('foreign');
  for (const changed of [
    { ...variant, id: 'wrong' },
    { ...variant, seed: 'foreign' },
    { ...variant, tasks: variant.tasks.slice(1) },
    {
      ...variant,
      tasks: variant.tasks.map((task) =>
        task.taskNumber === 14
          ? { ...task, criteria: { ...task.criteria, max: 2 } }
          : task,
      ),
    },
    {
      ...variant,
      tasks: [...variant.tasks, variant13Alternatives('negative').document],
    },
    {
      ...variant,
      tasks: variant.tasks.map((task, i) => (i === 0 ? other.tasks[0] : task)),
    },
    {
      ...variant,
      tasks: variant.tasks.map((task, i) =>
        i === 0
          ? { ...task, answer: { type: 'integer', value: '999999999' } }
          : task,
      ),
    },
    { ...variant, tasks: [...variant.tasks].reverse() },
    { kind: 'fixed', id: 'V01', tasks: variant.tasks },
  ])
    await expect(createVariantDataset(changed)).rejects.toThrow();
});
