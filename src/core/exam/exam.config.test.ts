import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { examConfig, practiceTaskNumbers } from './exam.config';
import { TaskInstanceSchema, VariantSchema } from '../schemas';
import {
  taskExample,
  variantExample,
} from '../../../tests/fixtures/model-examples';

const formatDocument = readFileSync(
  new URL('../../../docs/exam-format.md', import.meta.url),
  'utf8',
);
const sourceSnapshot = z
  .object({
    checked_date: z.string(),
    exam_year: z.number(),
    exam_status: z.string(),
    grading_year: z.number(),
    sources: z.array(
      z.object({
        id: z.string(),
        url: z.string(),
        archive_member: z.string().optional(),
      }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../docs/sources/informatics-2026-10-05.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

test('all 16 descriptions, KES codes, levels and maxima match the verified table', () => {
  const rows = formatDocument
    .split('## Таблица номеров')[1]
    ?.split('## Файлы и оценивание')[0];
  expect(rows).toBeDefined();
  const expected = rows
    ?.split('\n')
    .filter((line) => /^\| \d+ \|/u.test(line))
    .map((line) => {
      const fields = line.split('|').map((field) => field.trim());
      return {
        number: Number(fields[1]),
        skill: fields[2],
        kes: fields[3]?.split(' / '),
        level: fields[4],
        maxScore: Number(fields[5]),
      };
    });
  const levelLabels = {
    basic: 'базовый',
    advanced: 'повышенный',
    high: 'высокий',
  };
  const actual = Object.entries(examConfig.tasks).map(([number, task]) => ({
    number: Number(number),
    skill: task.skill,
    kes: task.kes,
    level: levelLabels[task.level],
    maxScore: task.maxScore,
  }));
  expect(actual).toHaveLength(16);
  expect(actual).toEqual(expected);
  expect(actual.map((task) => task.number)).toEqual(
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
});

test('maximum is 21; branch 13 is counted once and tasks 15 and 16 are separate', () => {
  const tasks = Object.values(examConfig.tasks);
  expect(tasks.reduce((total, task) => total + task.maxScore, 0)).toBe(21);
  expect(examConfig.maxScore).toBe(21);
  expect(examConfig.taskCount).toBe(16);
  expect(examConfig.tasks[13].maxScore).toBe(2);
  expect(examConfig.tasks[14].maxScore).toBe(3);
  expect(examConfig.tasks[15].artifactKinds).toEqual(['robot']);
  expect(examConfig.tasks[16].artifactKinds).toEqual(['program']);
  expect(examConfig.task13.selection).toBe('exactly-one');
  expect(examConfig.task13.alternatives).toEqual([
    { number: '13.1', kind: 'presentation', kes: '4.3', answerFormat: 'odp' },
    { number: '13.2', kind: 'document', kes: '4.1', answerFormat: 'odt' },
  ]);
});

test('parts partition the exam; computer short answers do not become artifact tasks', () => {
  expect(examConfig.parts[1].taskNumbers).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(examConfig.parts[2].taskNumbers).toEqual([11, 12, 13, 14, 15, 16]);
  for (const part of [1, 2] as const) {
    for (const number of examConfig.parts[part].taskNumbers)
      expect(examConfig.tasks[number].examPart).toBe(part);
  }
  expect(examConfig.parts[2].computerRequired).toBe(true);
  for (const number of [11, 12] as const) {
    expect(examConfig.tasks[number].assessment).toBe('short-answer');
    expect(examConfig.tasks[number].maxScore).toBe(1);
  }
  expect(examConfig.durationMinutes).toBe(150);
  expect(examConfig.recommendedTime).toMatchObject({
    kind: 'recommendation',
    minutesByPart: { 1: 30, 2: 120 },
  });
  expect(
    Object.values(examConfig.recommendedTime.minutesByPart).reduce(
      (sum, minutes) => sum + minutes,
      0,
    ),
  ).toBe(examConfig.durationMinutes);
});

test('2027 draft format and 2026 recommended grading retain independent provenance', () => {
  expect(examConfig.format).toMatchObject({
    year: 2027,
    status: 'draft',
    verification: 'VERIFIED',
    finalApproval: 'UNVERIFIED',
    checkedOn: '2026-10-05',
  });
  expect(examConfig.grading).toMatchObject({
    year: 2026,
    status: 'recommendation',
    verification: 'VERIFIED',
    applicabilityToFormatYear: 'UNVERIFIED',
    regionalApplicability: 'UNVERIFIED',
  });
  expect(examConfig.format.year).toBe(sourceSnapshot.exam_year);
  expect(examConfig.format.status).toBe(sourceSnapshot.exam_status);
  expect(examConfig.grading.year).toBe(sourceSnapshot.grading_year);
  expect(examConfig.format.checkedOn).toBe(sourceSnapshot.checked_date);
  expect(examConfig.grading.checkedOn).toBe(sourceSnapshot.checked_date);
  expect(examConfig.grading.source).toMatchObject({
    id: 'R26',
    pages: [8],
    pageNumbering: 'pdf',
    table: 11,
  });
  expect(examConfig.grading.notice).toContain('2026');
  expect(examConfig.grading.notice).toContain('Региональные');
});

test('every source points to the stored official snapshot and records page numbers', () => {
  const references = [
    examConfig.format.source,
    examConfig.grading.source,
    examConfig.recommendedTime.source,
    examConfig.task13.source,
    ...Object.values(examConfig.tasks).map((task) => task.source),
  ];
  for (const reference of references) {
    const stored = sourceSnapshot.sources.find(
      (source) => source.id === reference.id,
    );
    expect(stored).toBeDefined();
    expect(reference.url).toBe(stored?.url);
    expect(reference.url).toMatch(/^https:\/\/doc\.fipi\.ru\//u);
    if (stored?.archive_member)
      expect(reference.document).toBe(stored.archive_member);
    expect(reference.pages.length).toBeGreaterThan(0);
    expect(
      reference.pages.every((page) => Number.isInteger(page) && page > 0),
    ).toBe(true);
  }
  for (const number of examConfig.parts[1].taskNumbers)
    expect(examConfig.tasks[number].source.pages).toEqual([13]);
  expect(examConfig.tasks[15].source.pages).toEqual([14]);
  expect(examConfig.tasks[16].source.pages).toEqual([14]);
});

test('recommended ranges match R26 exactly and cover 0–21 without overlaps or gaps', () => {
  expect(examConfig.grading.ranges).toEqual([
    { min: 0, max: 4, grade: 2 },
    { min: 5, max: 10, grade: 3 },
    { min: 11, max: 16, grade: 4 },
    { min: 17, max: 21, grade: 5 },
  ]);
  for (let score = 0; score <= examConfig.maxScore; score += 1) {
    const matches = examConfig.grading.ranges.filter(
      (range) => score >= range.min && score <= range.max,
    );
    expect(matches, `Баллы ${String(score)}`).toHaveLength(1);
  }
  for (const range of examConfig.grading.ranges) {
    expect(formatDocument).toContain(
      `| ${String(range.min)}–${String(range.max)} | «${String(range.grade)}» |`,
    );
  }
});

test('practice-kind lookup agrees with numbered tasks and covers both alternatives', () => {
  for (const [kind, number] of Object.entries(practiceTaskNumbers)) {
    expect(examConfig.tasks[number].assessment).toBe('criteria');
    expect(examConfig.tasks[number].artifactKinds).toContain(kind);
  }
  expect(new Set(Object.values(practiceTaskNumbers))).toEqual(
    new Set([13, 14, 15, 16]),
  );
});

test('task and variant schemas consume the config while rejecting incorrect scoring', () => {
  const variant = variantExample();
  expect(VariantSchema.parse(variant)).toEqual(variant);
  for (const task of variant.tasks) {
    const rule = examConfig.tasks[task.taskNumber];
    expect(TaskInstanceSchema.parse(task).examPart).toBe(rule.examPart);
    expect(task.criteria?.max ?? 1).toBe(rule.maxScore);
    expect(
      TaskInstanceSchema.safeParse({
        ...task,
        examPart: rule.examPart === 1 ? 2 : 1,
      }).success,
    ).toBe(false);
  }
  expect(
    TaskInstanceSchema.safeParse({
      ...taskExample(14),
      criteria: taskExample(13).criteria,
    }).success,
  ).toBe(false);
  expect(
    VariantSchema.safeParse({
      ...variant,
      tasks: variant.tasks.filter((task) => task.taskNumber !== 16),
    }).success,
  ).toBe(false);
});
