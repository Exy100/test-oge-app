import { fixedVariants, VARIANT_VERSION } from './catalog';
import { scoreVariant } from '../scoring';
import { ScoreSchema } from '../schemas';
import type { PracticeEvidence, Score, Variant } from '../types';
import type { LocalStore } from '../storage/store';
import type { ExamAttempt } from './exam';

export function scoreAttempt(variant: Variant, attempt: ExamAttempt) {
  if (
    variant.id !== attempt.variantId ||
    (!fixedVariants.some((row) => row.id === attempt.variantId) &&
      attempt.variantId !== `${VARIANT_VERSION}:${attempt.seed}`) ||
    (variant.kind === 'generated'
      ? variant.seed
      : fixedVariants.find((row) => row.id === variant.id)?.seed) !==
      attempt.seed ||
    variant.tasks.find((task) => task.taskNumber === 13)?.variant13 !==
      attempt.variant13
  )
    throw new Error('Сохранённая работа не соответствует варианту.');
  const answers = variant.tasks
    .filter((task) => task.taskNumber <= 12)
    .map((task) => ({
      taskId: task.id,
      answer:
        attempt.answers.find((row) => row.taskNumber === task.taskNumber)
          ?.text ?? '',
    }));
  const practice: PracticeEvidence[] = [];
  for (const task of variant.tasks) {
    if (task.answer.type !== 'artifact') continue;
    const saved = attempt.assessments.find(
      (row) => row.taskNumber === task.taskNumber,
    );
    if (!saved) continue;
    const score = ScoreSchema.parse(saved.score);
    const base = {
      taskId: task.id,
      criteriaAnswers: [],
      ...(saved.source === 'self' ? { selfAssessment: score } : {}),
      assessment: { source: saved.source, score },
    };
    const kind = task.answer.kind;
    practice.push(
      kind === 'robot' || kind === 'program'
        ? {
            ...base,
            kind,
            code:
              attempt.answers.find((row) => row.taskNumber === task.taskNumber)
                ?.text ?? '',
            localRuns: [],
          }
        : { ...base, kind },
    );
  }
  return scoreVariant(variant, { answers, practice });
}

/** Refresh before writing; stale reviews cannot resurrect deletions or erase newer work. */
export function saveAttemptResult(
  store: LocalStore,
  expected: ExamAttempt,
  verifiedVariant: Variant,
  change?: {
    taskNumber: 13 | 14 | 15 | 16;
    score: Score | null;
    source?: 'self' | 'aiAccepted';
  },
): ExamAttempt {
  store.refresh();
  const history = store.read('variantAttempts');
  const current = history.entries.find((row) => row.id === expected.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(
      'История изменилась в другой вкладке или в настройках. Проверь обновлённый результат и повтори выбор.',
    );
  if (
    change &&
    (![13, 14, 15, 16].includes(change.taskNumber) ||
      (change.source === 'aiAccepted' &&
        (change.taskNumber <= 14 || change.score === null)) ||
      (change.score !== null &&
        (!Number.isInteger(change.score) ||
          change.score < 0 ||
          change.score > (change.taskNumber === 14 ? 3 : 2))))
  )
    throw new RangeError('Самооценка выходит за критерии задания.');
  const assessments = change
    ? current.assessments.filter((row) => row.taskNumber !== change.taskNumber)
    : current.assessments;
  if (change?.score !== undefined && change.score !== null)
    assessments.push({
      taskNumber: change.taskNumber,
      score: change.score,
      source: change.source ?? 'self',
    });
  const next = { ...current, assessments };
  const result = scoreAttempt(verifiedVariant, next);
  next.score = result.primaryScore;
  if (JSON.stringify(next) !== JSON.stringify(current))
    store.write('variantAttempts', {
      ...history,
      entries: history.entries.map((row) => (row.id === next.id ? next : row)),
    });
  return next;
}
