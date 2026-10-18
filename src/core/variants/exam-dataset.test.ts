import { expect, test } from 'vitest';
import {
  buildFixedVariant,
  fixedVariants,
  variant13Alternatives,
  variantSeed,
} from './index';
import { createExamDataset } from './exam-dataset';
import { createTaskDataset } from '../generators/task-dataset';
import { readZip } from '../datasets/zip';

test('all ten fixed variants download exact source bytes without references, criteria or scored examples', async () => {
  const families = new Set<string>();
  for (const fixed of fixedVariants) {
    const variant = buildFixedVariant(fixed.id);
    const alternatives = variant13Alternatives(variantSeed(variant));
    const tasks = [
      ...variant.tasks.filter((task) => [11, 12, 14].includes(task.taskNumber)),
      alternatives.presentation,
      alternatives.document,
    ];
    for (const task of tasks) {
      const full = await createTaskDataset(task),
        exam = await createExamDataset(task);
      const files = readZip(exam.archive);
      expect(files.size).toBeGreaterThan(0);
      expect(
        [...files.keys()].some(
          (path) =>
            /^(?:reference|examples)\//u.test(path) ||
            /criteria|answers|checks/u.test(path),
        ),
      ).toBe(false);
      for (const [path, bytes] of files)
        expect(bytes).toEqual(full.files.get(path));
      expect(exam.manifest.files.map((row) => row.path).sort()).toEqual(
        [...files.keys()].sort(),
      );
      if (task.taskNumber <= 12) expect(files).toEqual(full.files);
      if (task.taskNumber === 14) {
        families.add(task.subtype);
        expect([...files.keys()].sort()).toEqual([
          'assignment.txt',
          'source/data.csv',
          'source/data.ods',
        ]);
      }
      if (task.variant13 === 'presentation') {
        expect(files.has('source/material.odt')).toBe(true);
        expect(files.has('layout/guide.txt')).toBe(true);
        expect(
          [...files.keys()].some((path) => path.startsWith('images/')),
        ).toBe(true);
      }
      if (task.variant13 === 'document') {
        expect(files.has('source/material.txt')).toBe(true);
        expect(files.has('layout/sample.pdf')).toBe(true);
      }
    }
  }
  expect(families.size).toBe(3);
  const short = buildFixedVariant('V01').tasks[0];
  if (!short) throw new Error('Missing short answer');
  await expect(createExamDataset(short)).rejects.toThrow();
}, 60_000);
