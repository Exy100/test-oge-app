import { expect, test } from 'vitest';
import { scoreVariant, gradeForScore } from './index';
import type { VariantResponses } from './index';
import type { PracticeEvidence, Score } from '../types';
import { variantExample } from '../../../tests/fixtures/model-examples';

function responsesForTotal(total: number): VariantResponses {
  let remaining = total;
  const answers: VariantResponses['answers'] = [];
  const practice: PracticeEvidence[] = [];
  for (const task of variantExample().tasks) {
    if (task.answer.type !== 'artifact') {
      const correct = remaining > 0;
      if (correct) remaining -= 1;
      answers.push({
        taskId: task.id,
        answer: correct ? task.answer.value : '',
      });
    } else {
      const maximum = task.criteria?.max ?? 2;
      const score = Math.min(remaining, maximum);
      remaining -= score;
      if (score !== 0 && score !== 1 && score !== 2 && score !== 3)
        throw new RangeError('Недопустимый балл теста.');
      const base = {
        taskId: task.id,
        criteriaAnswers: [],
        selfAssessment: score,
      } satisfies Pick<
        PracticeEvidence,
        'taskId' | 'criteriaAnswers' | 'selfAssessment'
      >;
      const kind = task.answer.kind;
      practice.push(
        kind === 'robot' || kind === 'program'
          ? { ...base, kind, code: '', localRuns: [] }
          : { ...base, kind },
      );
    }
  }
  return { answers, practice };
}

test.each([
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 2],
  [5, 3],
  [6, 3],
  [7, 3],
  [8, 3],
  [9, 3],
  [10, 3],
  [11, 4],
  [12, 4],
  [13, 4],
  [14, 4],
  [15, 4],
  [16, 4],
  [17, 5],
  [18, 5],
  [19, 5],
  [20, 5],
  [21, 5],
])('complete score %i gives recommended grade %i', (score, grade) => {
  const result = scoreVariant(variantExample(), responsesForTotal(score));
  expect(result).toMatchObject({
    complete: true,
    primaryScore: score,
    knownScore: score,
    maxScore: 21,
    grade,
    pendingTaskNumbers: [],
    possibleScore: { min: score, max: score },
  });
  expect(result.rows).toHaveLength(16);
  expect(result.rows.reduce((sum, row) => sum + (row.score ?? 0), 0)).toBe(
    score,
  );
  expect(result.grading.year).toBe(2026);
  expect(result.grading.source).toMatchObject({
    id: 'R26',
    pages: [8],
    table: 11,
  });
  expect(result.format).toMatchObject({ year: 2027, status: 'draft' });
  expect(result.grading.applicabilityToFormatYear).toBe('UNVERIFIED');
});

test.each([-1, 22, 0.5, NaN, Infinity, -Infinity, -0])(
  'grade rejects invalid score %s',
  (score) => {
    expect(() => gradeForScore(score)).toThrow(RangeError);
  },
);

test('no practical assessments means a partial result, not four confirmed zeroes', () => {
  const result = scoreVariant(variantExample(), {
    ...responsesForTotal(21),
    practice: [],
  });
  expect(result).toMatchObject({
    complete: false,
    primaryScore: null,
    grade: null,
    knownScore: 12,
    possibleScore: { min: 12, max: 21 },
    pendingTaskNumbers: [13, 14, 15, 16],
  });
  expect(
    result.rows
      .filter((row) => row.kind === 'practice')
      .every((row) => row.score === null && row.source === null),
  ).toBe(true);
});

test.each([13, 14, 15, 16])(
  'missing assessment for task %i stays incomplete',
  (number) => {
    const responses = responsesForTotal(21);
    responses.practice = responses.practice.filter(
      (item) => item.taskId !== `contract-${String(number)}`,
    );
    const missingMax = number === 14 ? 3 : 2;
    const result = scoreVariant(variantExample(), responses);
    expect(result).toMatchObject({
      complete: false,
      knownScore: 21 - missingMax,
      primaryScore: null,
      grade: null,
      pendingTaskNumbers: [number],
      possibleScore: { min: 21 - missingMax, max: 21 },
    });
  },
);

test('a saved program or successful local run does not assign a practice score', () => {
  const responses = responsesForTotal(21);
  responses.practice = responses.practice.map((evidence) =>
    evidence.kind === 'program'
      ? {
          kind: 'program',
          taskId: evidence.taskId,
          criteriaAnswers: [{ criterionScore: 2, answer: 'Проходит пример.' }],
          code: 'print(2 + 2)',
          localRuns: [
            {
              testId: 'example',
              input: '',
              output: String(2 + 2),
              status: 'completed',
              origin: 'userLocal',
            },
          ],
        }
      : evidence,
  );
  expect(scoreVariant(variantExample(), responses)).toMatchObject({
    complete: false,
    knownScore: 19,
    pendingTaskNumbers: [16],
  });
});

test('explicit zero is assessed, while accepted AI score preserves both sources', () => {
  const responses = responsesForTotal(0);
  responses.practice = responses.practice.map((item) =>
    item.kind === 'program'
      ? {
          ...item,
          selfAssessment: 1,
          assessment: { source: 'aiAccepted', score: 2 },
        }
      : item,
  );
  const result = scoreVariant(variantExample(), responses);
  expect(result).toMatchObject({ complete: true, primaryScore: 2, grade: 2 });
  expect(result.rows.find((row) => row.taskNumber === 16)).toMatchObject({
    score: 2,
    source: 'aiAccepted',
    selfAssessment: 1,
  });
  expect(result.rows.find((row) => row.taskNumber === 13)).toMatchObject({
    score: 0,
    source: 'self',
  });
  expect(result.practiceNotice).toContain('эксперты');
});

test('accepted AI zero takes priority over a positive self-assessment', () => {
  const responses = responsesForTotal(21);
  responses.practice = responses.practice.map((item) =>
    item.kind === 'robot'
      ? { ...item, assessment: { source: 'aiAccepted', score: 0 } }
      : item,
  );
  const result = scoreVariant(variantExample(), responses);
  expect(result).toMatchObject({ complete: true, primaryScore: 19 });
  expect(result.rows.find((row) => row.taskNumber === 15)).toMatchObject({
    score: 0,
    source: 'aiAccepted',
    selfAssessment: 2,
  });
});

test('an explicitly accepted AI assessment can stand without an earlier self-assessment', () => {
  const responses = responsesForTotal(0);
  responses.practice = responses.practice.map((item) =>
    item.kind === 'program'
      ? {
          kind: 'program',
          taskId: item.taskId,
          code: 'print(1)',
          localRuns: [],
          criteriaAnswers: [],
          assessment: { source: 'aiAccepted', score: 1 },
        }
      : item,
  );
  expect(scoreVariant(variantExample(), responses)).toMatchObject({
    complete: true,
    primaryScore: 1,
  });
});

test.each(['presentation', 'document'] as const)(
  'branch %s counts once',
  (kind) => {
    const variant = variantExample();
    variant.tasks = variant.tasks.map((task) =>
      task.taskNumber === 13
        ? {
            ...task,
            variant13: kind,
            answer: { type: 'artifact', kind, referenceId: 'reference' },
          }
        : task,
    );
    const responses = responsesForTotal(21);
    responses.practice = responses.practice.map((item) =>
      item.kind === 'presentation' ? { ...item, kind } : item,
    );
    const result = scoreVariant(variant, responses);
    expect(result.primaryScore).toBe(21);
    expect(result.rows.filter((row) => row.taskNumber === 13)).toHaveLength(1);
  },
);

test('stale evidence from the other branch and duplicate evidence cannot be counted', () => {
  const responses = responsesForTotal(21);
  const other = {
    taskId: 'contract-13',
    kind: 'document',
    criteriaAnswers: [],
    selfAssessment: 2,
  };
  expect(() =>
    scoreVariant(variantExample(), {
      ...responses,
      practice: responses.practice.map((item) =>
        item.taskId === other.taskId ? other : item,
      ),
    }),
  ).toThrow('ветке');
  expect(() =>
    scoreVariant(variantExample(), {
      ...responses,
      practice: [...responses.practice, other],
    }),
  ).toThrow();
});

test.each([0, 1, 2, 3] as const)(
  'spreadsheet accepts %i points without capping at two',
  (score: Score) => {
    const responses = responsesForTotal(0);
    responses.practice = responses.practice.map((item) =>
      item.kind === 'spreadsheet' ? { ...item, selfAssessment: score } : item,
    );
    expect(scoreVariant(variantExample(), responses).primaryScore).toBe(score);
  },
);

test('short answers are checked again, including computer tasks; format errors earn no points or attempt', () => {
  const responses = responsesForTotal(21);
  responses.answers = responses.answers.map((item) =>
    item.taskId === 'contract-11'
      ? { ...item, answer: `${item.answer}.0` }
      : item.taskId === 'contract-12'
        ? { ...item, answer: `+000${item.answer}` }
        : item,
  );
  const result = scoreVariant(variantExample(), responses);
  expect(result.primaryScore).toBe(20);
  expect(result.rows.find((row) => row.taskNumber === 11)).toMatchObject({
    score: 0,
    check: { verdict: 'format_error', counted: false },
  });
  expect(result.rows.find((row) => row.taskNumber === 12)).toMatchObject({
    score: 1,
    check: { verdict: 'correct' },
  });
});

test('no responses preserve all pending practice and report unanswered short tasks explicitly', () => {
  const result = scoreVariant(variantExample(), { answers: [], practice: [] });
  expect(result).toMatchObject({
    complete: false,
    knownScore: 0,
    possibleScore: { min: 0, max: 9 },
  });
  expect(
    result.rows
      .filter((row) => row.kind === 'short-answer')
      .every((row) => row.score === 0 && !row.answered),
  ).toBe(true);
});

test('boundaries reject invented scores, mismatched types and unknown task IDs', () => {
  const base = responsesForTotal(0);
  const invalid: unknown[] = [
    { ...base, primaryScore: 21 },
    {
      ...base,
      answers: [{ taskId: 'contract-1', answer: '0', verdict: 'correct' }],
    },
    { ...base, answers: [{ taskId: 'unknown', answer: '64' }] },
    { ...base, answers: [{ taskId: 'contract-13', answer: '2' }] },
    {
      ...base,
      answers: [
        { taskId: 'contract-1', answer: '64' },
        { taskId: 'contract-1', answer: '64' },
      ],
    },
    {
      ...base,
      practice: [
        {
          kind: 'document',
          taskId: 'contract-1',
          criteriaAnswers: [],
          selfAssessment: 2,
        },
      ],
    },
    {
      ...base,
      practice: [
        {
          kind: 'document',
          taskId: 'unknown',
          criteriaAnswers: [],
          selfAssessment: 2,
        },
      ],
    },
    {
      ...base,
      practice: [
        {
          kind: 'presentation',
          taskId: 'contract-13',
          criteriaAnswers: [],
          selfAssessment: 3,
        },
      ],
    },
    {
      ...base,
      practice: [
        {
          kind: 'spreadsheet',
          taskId: 'contract-14',
          criteriaAnswers: [],
          selfAssessment: 4,
        },
      ],
    },
    {
      ...base,
      practice: [
        {
          kind: 'presentation',
          taskId: 'contract-13',
          criteriaAnswers: [],
          assessment: { source: 'aiAccepted', score: 2 },
        },
      ],
    },
  ];
  for (const responses of invalid)
    expect(() => scoreVariant(variantExample(), responses)).toThrow();
  expect(() =>
    scoreVariant({ ...variantExample(), tasks: [] }, base),
  ).toThrow();
});

test('input order is irrelevant, output is sorted, and inputs are not mutated', () => {
  const variant = variantExample();
  const responses = responsesForTotal(21);
  variant.tasks.reverse();
  responses.answers.reverse();
  responses.practice.reverse();
  const before = JSON.stringify({ variant, responses });
  const result = scoreVariant(variant, responses);
  expect(result.rows.map((row) => row.taskNumber)).toEqual(
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  expect(result.primaryScore).toBe(21);
  expect(JSON.stringify({ variant, responses })).toBe(before);
});
