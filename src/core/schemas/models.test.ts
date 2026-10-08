import { expect, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import {
  CorrectAnswerSchema,
  DatasetFileSchema,
  DatasetManifestSchema,
  FigureSpecSchema,
  GradingCriteriaSchema,
  PracticeEvidenceSchema,
  RelativePathSchema,
  TaskInstanceSchema,
  TaskNumberSchema,
  ScoreSchema,
  VariantSchema,
} from './index';
import type {
  CorrectAnswer,
  DatasetManifest,
  FigureSpec,
  GradingCriteria,
  PracticeEvidence,
  TaskInstance,
  Variant,
} from '../types';
import {
  answerExamples,
  evidenceExamples,
  figureExamples,
  manifestExample,
  taskExample,
  variantExample,
} from '../../../tests/fixtures/model-examples';

test('exported models match both schema input and output', () => {
  expectTypeOf<TaskInstance>().toEqualTypeOf<
    z.input<typeof TaskInstanceSchema>
  >();
  expectTypeOf<TaskInstance>().toEqualTypeOf<
    z.output<typeof TaskInstanceSchema>
  >();
  expectTypeOf<CorrectAnswer>().toEqualTypeOf<
    z.output<typeof CorrectAnswerSchema>
  >();
  expectTypeOf<GradingCriteria>().toEqualTypeOf<
    z.output<typeof GradingCriteriaSchema>
  >();
  expectTypeOf<FigureSpec>().toEqualTypeOf<z.output<typeof FigureSpecSchema>>();
  expectTypeOf<DatasetManifest>().toEqualTypeOf<
    z.output<typeof DatasetManifestSchema>
  >();
  expectTypeOf<PracticeEvidence>().toEqualTypeOf<
    z.output<typeof PracticeEvidenceSchema>
  >();
  expectTypeOf<Variant>().toEqualTypeOf<z.output<typeof VariantSchema>>();
});

test.each(answerExamples)(
  'answer $type round-trips without coercion',
  (answer) => {
    expect(
      CorrectAnswerSchema.parse(JSON.parse(JSON.stringify(answer))),
    ).toEqual(answer);
  },
);
test.each(['+1', '01', '-0', '1.0', '1e3', ' 1', 'NaN', 'Infinity', ''])(
  'rejects noncanonical integer %s',
  (value) => {
    expect(
      CorrectAnswerSchema.safeParse({ type: 'integer', value }).success,
    ).toBe(false);
  },
);
test.each([
  { type: 'integer', value: 1 },
  { type: 'word', value: 'А' },
  { type: 'sequence', value: 'AА', alphabet: 'latin', caseSensitive: false },
  { type: 'sequence', value: '1 2', alphabet: 'digits', caseSensitive: false },
  { type: 'artifact', kind: 'document', referenceId: '' },
  { type: 'integer', value: '1', caseSensitive: false },
])('rejects malformed answer %#', (answer) => {
  expect(CorrectAnswerSchema.safeParse(answer).success).toBe(false);
});

test('all sixteen task numbers have valid structure and preserve exact data', () => {
  for (const task of variantExample().tasks) {
    expect(TaskInstanceSchema.parse(JSON.parse(JSON.stringify(task)))).toEqual(
      task,
    );
  }
  const document = taskExample(13);
  document.variant13 = 'document';
  document.answer = { type: 'artifact', kind: 'document', referenceId: 'doc' };
  expect(TaskInstanceSchema.parse(document)).toEqual(document);
});
test.each([0, 17, 1.5, '1', NaN, Infinity])(
  'rejects task number %s',
  (value) => {
    expect(TaskNumberSchema.safeParse(value).success).toBe(false);
  },
);
test.each([-1, 4, 0.5, '2'])('rejects score %s', (value) => {
  expect(ScoreSchema.safeParse(value).success).toBe(false);
});
test.each([
  { examPart: 2 },
  { id: ' ' },
  { hints: ['Одна'] },
  { solution: [] },
  { topics: [] },
  { unexpected: true },
  { variant13: 'document' },
  { answer: { type: 'artifact', kind: 'program', referenceId: 'x' } },
])('rejects broken short task %#', (change) => {
  expect(
    TaskInstanceSchema.safeParse({ ...taskExample(), ...change }).success,
  ).toBe(false);
});
test('computer short answers are part 2 and have no practice criteria', () => {
  for (const number of [11, 12] as const) {
    expect(
      TaskInstanceSchema.safeParse({ ...taskExample(number), examPart: 1 })
        .success,
    ).toBe(false);
    expect(
      TaskInstanceSchema.safeParse({
        ...taskExample(number),
        criteria: taskExample(13).criteria,
      }).success,
    ).toBe(false);
  }
});
test('practice requires matching kind, branch and exact grading maximum', () => {
  for (const number of [13, 14, 15, 16] as const) {
    const task = taskExample(number);
    expect(
      TaskInstanceSchema.safeParse({ ...task, criteria: undefined }).success,
    ).toBe(false);
    expect(
      TaskInstanceSchema.safeParse({
        ...task,
        answer: { type: 'integer', value: '1' },
      }).success,
    ).toBe(false);
  }
  expect(
    TaskInstanceSchema.safeParse({ ...taskExample(13), variant13: undefined })
      .success,
  ).toBe(false);
  expect(
    TaskInstanceSchema.safeParse({ ...taskExample(13), variant13: 'document' })
      .success,
  ).toBe(false);
  expect(
    TaskInstanceSchema.safeParse({
      ...taskExample(14),
      criteria: taskExample(13).criteria,
    }).success,
  ).toBe(false);
  expect(
    TaskInstanceSchema.safeParse({
      ...taskExample(16),
      criteria: taskExample(14).criteria,
    }).success,
  ).toBe(false);
});
test.each(
  [
    [0, 1],
    [0, 1, 3],
    [0, 1, 1],
    [0, 1, 2, 3],
  ].map((scores) => ({ scores })),
)('rejects incomplete or inconsistent criteria $scores', ({ scores }) => {
  expect(
    GradingCriteriaSchema.safeParse({
      max: 2,
      levels: scores.map((score) => ({ score, description: 'Критерий' })),
    }).success,
  ).toBe(false);
});

test.each([
  '../x.txt',
  '/x.txt',
  'a/../x.txt',
  'a/./x.txt',
  'a//x.txt',
  'a/',
  'C:\\x.txt',
  '\\server\\x.txt',
  'https://example.org/x.txt',
  '//example.org/x.txt',
  '%2e%2e/x.txt',
  'a%252fx.txt',
  'a\u0000.txt',
  ' a.txt',
  'a.txt ',
  'x.txt?url=1',
  'x.txt#id',
])('rejects unsafe path %j', (path) => {
  expect(RelativePathSchema.safeParse(path).success).toBe(false);
});
test('manifest accepts generated and curated examples and preserves Cyrillic paths', () => {
  expect(DatasetManifestSchema.parse(manifestExample)).toEqual(manifestExample);
  expect(RelativePathSchema.parse('Тексты/Учебный файл.txt')).toBe(
    'Тексты/Учебный файл.txt',
  );
  const { generatorId, ...base } = manifestExample;
  expect(generatorId).toBe('text-files');
  expect(
    DatasetManifestSchema.safeParse({
      ...base,
      kind: 'curated',
      author: 'Автор',
    }).success,
  ).toBe(true);
});
test.each([
  { path: 'a.odt' },
  { format: 'exe' },
  { size: -1 },
  { size: -0 },
  { size: 0.1 },
  { size: Infinity },
  { sha256: '123' },
  { license: '' },
  { url: 'https://example.org' },
])('rejects invalid file descriptor %#', (change) => {
  expect(
    DatasetFileSchema.safeParse({ ...manifestExample.files[0], ...change })
      .success,
  ).toBe(false);
});
test('manifest rejects duplicate paths and missing version', () => {
  expect(
    DatasetManifestSchema.safeParse({
      ...manifestExample,
      files: [...manifestExample.files, ...manifestExample.files],
    }).success,
  ).toBe(false);
  expect(
    DatasetManifestSchema.safeParse({
      ...manifestExample,
      generatorVersion: undefined,
    }).success,
  ).toBe(false);
});

test.each(figureExamples)('figure $kind round-trips', (figure) => {
  expect(FigureSpecSchema.parse(JSON.parse(JSON.stringify(figure)))).toEqual(
    figure,
  );
});
test('rejects broken references and invalid geometry in every figure kind', () => {
  for (const figure of figureExamples) {
    let broken: unknown;
    switch (figure.kind) {
      case 'weighted-graph':
        broken = {
          ...figure,
          edges: [{ from: 'a', to: 'missing', weight: 3 }],
        };
        break;
      case 'directed-graph':
        broken = { ...figure, edges: [{ from: 'missing', to: 'b' }] };
        break;
      case 'table':
        broken = { ...figure, rows: [['one cell']] };
        break;
      case 'logic-circuit':
        broken = { ...figure, nodes: [...figure.nodes].reverse() };
        break;
      case 'place-value':
        broken = { ...figure, digits: [2] };
        break;
      case 'code-table':
        broken = { ...figure, entries: [...figure.entries, ...figure.entries] };
        break;
      case 'file-tree':
        broken = {
          ...figure,
          entries: [{ kind: 'file', path: 'missing/a.txt', size: 1 }],
        };
        break;
      case 'network-address':
        broken = { ...figure, host: 'example.org/other' };
        break;
      case 'robot-field':
        broken = { ...figure, start: { row: 2, column: 0 } };
        break;
    }
    expect(FigureSpecSchema.safeParse(broken).success, figure.kind).toBe(false);
  }
});
test.each([NaN, Infinity, -Infinity, -0])(
  'figures reject nonfinite numbers and negative zero: %s',
  (value) => {
    expect(
      FigureSpecSchema.safeParse({
        kind: 'table',
        description: 'Таблица',
        columns: ['Число'],
        rows: [[value]],
      }).success,
    ).toBe(false);
  },
);

test.each(evidenceExamples)(
  'practice evidence $kind remains separate from automatic verdicts',
  (evidence) => {
    expect(
      PracticeEvidenceSchema.parse(JSON.parse(JSON.stringify(evidence))),
    ).toEqual(evidence);
    expect(
      PracticeEvidenceSchema.safeParse({ ...evidence, verdict: 'correct' })
        .success,
    ).toBe(false);
  },
);
test('practice score limits, provenance and local run origin are enforced', () => {
  for (const evidence of evidenceExamples) {
    if (evidence.kind !== 'spreadsheet')
      expect(
        PracticeEvidenceSchema.safeParse({ ...evidence, selfAssessment: 3 })
          .success,
      ).toBe(false);
    if (evidence.kind === 'program' || evidence.kind === 'robot') {
      expect(
        PracticeEvidenceSchema.safeParse({
          ...evidence,
          localRuns: [
            {
              testId: '1',
              input: '',
              output: '',
              status: 'completed',
              origin: 'official',
            },
          ],
        }).success,
      ).toBe(false);
    } else {
      expect(
        PracticeEvidenceSchema.safeParse({
          ...evidence,
          assessment: { source: 'aiAccepted', score: 1 },
        }).success,
      ).toBe(false);
    }
    expect(
      PracticeEvidenceSchema.safeParse({
        ...evidence,
        selfAssessment: 1,
        assessment: { source: 'self', score: 2 },
      }).success,
    ).toBe(false);
  }
});
test('variant has one of each number, one branch of 13 and maximum 21', () => {
  const variant = variantExample();
  expect(VariantSchema.parse(variant)).toEqual(variant);
  expect(
    VariantSchema.safeParse({ kind: 'fixed', id: 'V01', tasks: variant.tasks })
      .success,
  ).toBe(true);
  expect(
    VariantSchema.safeParse({ ...variant, tasks: variant.tasks.slice(1) })
      .success,
  ).toBe(false);
  expect(
    VariantSchema.safeParse({
      ...variant,
      tasks: [...variant.tasks, taskExample(13)],
    }).success,
  ).toBe(false);
  expect(
    VariantSchema.safeParse({
      ...variant,
      tasks: variant.tasks.map((task) =>
        task.taskNumber === 16 ? taskExample(15) : task,
      ),
    }).success,
  ).toBe(false);
  expect(
    VariantSchema.safeParse({
      ...variant,
      tasks: variant.tasks.map((task) => ({ ...task, id: 'same' })),
    }).success,
  ).toBe(false);
});
