import { expect, test } from 'vitest';
import { buildFixedVariant, buildVariant, variantSeed } from './index';
import { saveAttemptResult, scoreAttempt } from './result';
import { buildExamVariant } from './result-variant';
import { createExamDraft, type ExamAttempt } from './exam';
import { LocalStore, type StoragePort } from '../storage/store';
import { ScoreSchema } from '../schemas';
import { PREFIX } from '../storage/schemas';
import legacyPrograms from '../../../tests/fixtures/python-legacy-variants.json' with { type: 'json' };

const variant = buildFixedVariant('V01', 'document');
test('saved attempts retain their old №16; new attempts explicitly select confirmed formats', () => {
  for (const saved of legacyPrograms) {
    const identity = {
      variantId: saved.id,
      seed: saved.seed,
      variant13: 'presentation' as const,
    };
    const restored = buildExamVariant(identity);
    expect(restored.tasks.find((task) => task.taskNumber === 16)).toEqual(
      saved.task,
    );
    const current = buildExamVariant({ ...identity, pythonFormatVersion: 1 });
    expect(current).toEqual(buildFixedVariant(saved.id));
    expect(current.tasks.filter((task) => task.taskNumber !== 16)).toEqual(
      restored.tasks.filter((task) => task.taskNumber !== 16),
    );
  }
  expect(attemptForTotal(0).pythonFormatVersion).toBe(1);
});
function attemptForTotal(total: number, source = variant): ExamAttempt {
  const choice = source.tasks.find((task) => task.taskNumber === 13)?.variant13;
  if (!choice) throw new Error('Нет работы №13.');
  const draft = createExamDraft(
    {
      id: 'result + 🧩',
      variantId: source.id,
      seed: variantSeed(source),
      variant13: choice,
    },
    0,
  );
  let remaining = total;
  const answers: ExamAttempt['answers'] = [];
  const assessments: ExamAttempt['assessments'] = [];
  for (const task of source.tasks) {
    if (task.answer.type !== 'artifact') {
      answers.push({
        taskNumber: task.taskNumber,
        text: remaining > 0 ? task.answer.value : '',
        reasoning: '',
      });
      remaining = Math.max(0, remaining - 1);
    } else {
      const score = Math.min(remaining, task.criteria?.max ?? 0);
      remaining -= score;
      assessments.push({
        taskNumber: task.taskNumber as 13 | 14 | 15 | 16,
        score,
        source: 'self',
      });
    }
  }
  return {
    ...draft,
    answers,
    assessments,
    finishedAt: new Date(1000).toISOString(),
    score: null,
  };
}
function fixture(attempt = attemptForTotal(21)) {
  const data = new Map<string, string>();
  const port: StoragePort = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const store = new LocalStore(() => port);
  store.write('variantAttempts', { version: 1, entries: [attempt] });
  const saved = store.read('variantAttempts').entries[0];
  if (!saved) throw new Error('Нет сохранённой попытки.');
  return { store, data, saved, port };
}
test.each(Array.from({ length: 22 }, (_, total) => total))(
  'saved answers compute score %i, ignoring a cached total',
  (total) => {
    const attempt = { ...attemptForTotal(total), score: 21 };
    const result = scoreAttempt(variant, attempt);
    expect(result).toMatchObject({
      complete: true,
      primaryScore: total,
      grade: total <= 4 ? 2 : total <= 10 ? 3 : total <= 16 ? 4 : 5,
    });
    expect(result.rows).toHaveLength(16);
    expect(result.grading.year).toBe(2026);
  },
);
test('missing assessments remain unknown while explicit zero is a complete result', () => {
  const attempt = attemptForTotal(0);
  expect(scoreAttempt(variant, attempt)).toMatchObject({
    complete: true,
    primaryScore: 0,
    grade: 2,
  });
  expect(scoreAttempt(variant, { ...attempt, assessments: [] })).toMatchObject({
    complete: false,
    primaryScore: null,
    grade: null,
    possibleScore: { min: 0, max: 9 },
    pendingTaskNumbers: [13, 14, 15, 16],
  });
});
test.each(['presentation', 'document'] as const)(
  'only the selected №13 %s is scored; №14 permits 3',
  (choice) => {
    const rebuilt = buildExamVariant({
      variantId: 'V01',
      seed: variantSeed(variant),
      variant13: choice,
    });
    const attempt = attemptForTotal(21, rebuilt);
    const result = scoreAttempt(rebuilt, attempt);
    expect(result.primaryScore).toBe(21);
    expect(result.rows.filter((row) => row.taskNumber === 13)).toHaveLength(1);
    expect(result.rows.find((row) => row.taskNumber === 14)?.score).toBe(3);
  },
);
test('random seeds are rebuilt exactly; unknown identities and mixed work are rejected', () => {
  const random = buildVariant('Сохранённый + 🧩', 'presentation');
  const attempt = attemptForTotal(17, random);
  expect(buildExamVariant(attempt)).toEqual(random);
  expect(() =>
    buildExamVariant({ ...attempt, variantId: 'old-version:seed' }),
  ).toThrow('не воспроизводится');
  expect(() =>
    buildExamVariant({ ...attemptForTotal(1), seed: 'different' }),
  ).toThrow('не воспроизводится');
  expect(() => scoreAttempt(variant, attempt)).toThrow('не соответствует');
  expect(() =>
    scoreAttempt(variant, { ...attemptForTotal(1), variant13: 'presentation' }),
  ).toThrow('не соответствует');
});
test('accepted program advice retains its source; invalid office AI scores are not silently accepted', () => {
  const attempt = attemptForTotal(21);
  const program = attempt.assessments.find((row) => row.taskNumber === 16);
  if (!program) throw new Error('Нет оценки программы.');
  program.source = 'aiAccepted';
  expect(
    scoreAttempt(variant, attempt).rows.find((row) => row.taskNumber === 16),
  ).toMatchObject({ score: 2, source: 'aiAccepted', selfAssessment: null });
  attempt.assessments[0] = { taskNumber: 13, source: 'aiAccepted', score: 2 };
  expect(() => scoreAttempt(variant, attempt)).toThrow();
});
test('updating, removing and restoring self-assessment recalculates history without editing answers or an active draft', () => {
  const { store, saved } = fixture();
  const draft = createExamDraft(
    {
      id: 'another-active-attempt',
      variantId: saved.variantId,
      seed: saved.seed,
      variant13: saved.variant13,
    },
    2000,
    'training',
  );
  store.write('variantDraft', { version: 1, current: draft });
  const other = { ...saved, id: 'other-history-entry' };
  store.write('variantAttempts', { version: 1, entries: [saved, other] });
  const synchronised = saveAttemptResult(store, saved, variant);
  expect(synchronised.score).toBe(21);
  expect(() =>
    saveAttemptResult(store, synchronised, buildFixedVariant('V02')),
  ).toThrow('не соответствует');
  const lowered = saveAttemptResult(store, synchronised, variant, {
    taskNumber: 14,
    score: 0,
  });
  expect(lowered.score).toBe(18);
  expect(lowered.answers).toEqual(saved.answers);
  const pending = saveAttemptResult(store, lowered, variant, {
    taskNumber: 14,
    score: null,
  });
  expect(pending.score).toBeNull();
  expect(pending.assessments).toHaveLength(3);
  const restored = saveAttemptResult(store, pending, variant, {
    taskNumber: 14,
    score: ScoreSchema.parse(3),
  });
  expect(restored.score).toBe(21);
  expect(store.read('variantAttempts').entries[1]).toEqual(other);
  expect(store.read('variantDraft').current).toEqual(draft);
  const revision = store.revision;
  expect(saveAttemptResult(store, restored, variant)).toEqual(restored);
  expect(store.revision).toBe(revision + 1); // refresh only, no redundant write
});
test('refresh detects other-tab changes and deletion; unrelated records are preserved', () => {
  const { store, saved, port } = fixture();
  const otherTab = new LocalStore(() => port);
  const changed = { ...saved, score: 20 };
  otherTab.write('variantAttempts', { version: 1, entries: [changed] });
  expect(() =>
    saveAttemptResult(store, saved, variant, { taskNumber: 14, score: 0 }),
  ).toThrow('История изменилась');
  expect(store.read('variantAttempts').entries).toEqual([changed]);
  otherTab.write('variantAttempts', { version: 1, entries: [] });
  expect(() => saveAttemptResult(store, changed, variant)).toThrow(
    'История изменилась',
  );
  expect(store.read('variantAttempts').entries).toEqual([]);
});
test('invalid self-assessment never writes and quota failure retains a usable in-memory result', () => {
  const { store, saved, data, port } = fixture();
  for (const score of [-1, 3, 0.5, NaN]) {
    expect(() =>
      saveAttemptResult(store, saved, variant, {
        taskNumber: 13,
        score: score as 0,
      }),
    ).toThrow('Самооценка');
  }
  expect(() =>
    saveAttemptResult(store, saved, variant, {
      taskNumber: 12 as 13,
      score: 0,
    }),
  ).toThrow('Самооценка');
  expect(store.read('variantAttempts').entries[0]).toEqual(saved);
  const unavailable = new LocalStore(() => ({
    ...port,
    setItem: () => {
      throw new Error('quota');
    },
  }));
  saveAttemptResult(unavailable, saved, variant, { taskNumber: 14, score: 0 });
  expect(unavailable.memoryOnly).toBe(true);
  expect(unavailable.read('variantAttempts').entries[0]?.score).toBe(18);
  expect(
    JSON.parse(data.get(PREFIX + 'variantAttempts') ?? '{}'),
  ).toMatchObject({ entries: [{ score: null }] });
});
