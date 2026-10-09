import { z } from '../zod';
import { checkTaskAnswer } from '../checker';
import type { AnswerCheck } from '../checker';
import { examConfig } from '../exam/exam.config';
import { PracticeEvidenceSchema, VariantSchema } from '../schemas';
import { TextSchema, unique } from '../schemas/shared';
import type { ArtifactKind, Score, TaskNumber } from '../types';

export const VariantResponsesSchema = z.strictObject({
  answers: z
    .array(z.strictObject({ taskId: TextSchema, answer: z.string() }))
    .refine(
      (items) => unique(items.map((item) => item.taskId)),
      'Ответ на задание должен быть один.',
    ),
  practice: z
    .array(PracticeEvidenceSchema)
    .refine(
      (items) => unique(items.map((item) => item.taskId)),
      'Оценка практической работы должна быть одна.',
    ),
});
export type VariantResponses = z.infer<typeof VariantResponsesSchema>;
export type Grade = 2 | 3 | 4 | 5;
interface RowBase {
  taskId: string;
  taskNumber: TaskNumber;
  maxScore: number;
}
export type ScoreRow = RowBase &
  (
    | {
        kind: 'short-answer';
        score: 0 | 1;
        answered: boolean;
        check: AnswerCheck;
      }
    | {
        kind: 'practice';
        artifactKind: ArtifactKind;
        score: Score | null;
        source: 'self' | 'aiAccepted' | null;
        selfAssessment: Score | null;
      }
  );
interface ResultBase {
  rows: ScoreRow[];
  knownScore: number;
  maxScore: number;
  possibleScore: { min: number; max: number };
  pendingTaskNumbers: TaskNumber[];
  format: typeof examConfig.format;
  grading: typeof examConfig.grading;
  practiceNotice: string;
}
export type VariantScore = ResultBase &
  (
    | { complete: true; primaryScore: number; grade: Grade }
    | { complete: false; primaryScore: null; grade: null }
  );

export function gradeForScore(score: number): Grade {
  if (
    !Number.isInteger(score) ||
    Object.is(score, -0) ||
    score < 0 ||
    score > examConfig.maxScore
  )
    throw new RangeError('Нужен целый балл от 0 до 21.');
  const range = examConfig.grading.ranges.find(
    (item) => score >= item.min && score <= item.max,
  );
  if (!range) throw new RangeError('Для этого балла нет диапазона в шкале.');
  return range.grade;
}

/** Validate both boundaries; never trust a supplied score or verdict for short answers. */
export function scoreVariant(
  variantInput: unknown,
  responsesInput: unknown,
): VariantScore {
  const variant = VariantSchema.parse(variantInput);
  const responses = VariantResponsesSchema.parse(responsesInput);
  const tasks = new Map(variant.tasks.map((task) => [task.id, task]));
  for (const response of responses.answers) {
    const task = tasks.get(response.taskId);
    if (!task || task.answer.type === 'artifact')
      throw new TypeError('Краткий ответ не соответствует заданию варианта.');
  }
  for (const evidence of responses.practice) {
    const task = tasks.get(evidence.taskId);
    if (
      !task ||
      task.answer.type !== 'artifact' ||
      task.answer.kind !== evidence.kind
    )
      throw new TypeError(
        'Практическая работа не соответствует заданию или выбранной ветке №13.',
      );
  }
  const answers = new Map(
    responses.answers.map((item) => [item.taskId, item.answer]),
  );
  const practice = new Map(
    responses.practice.map((item) => [item.taskId, item]),
  );
  const rows: ScoreRow[] = [...variant.tasks]
    .sort((a, b) => a.taskNumber - b.taskNumber)
    .map((task): ScoreRow => {
      const base = {
        taskId: task.id,
        taskNumber: task.taskNumber,
        maxScore: examConfig.tasks[task.taskNumber].maxScore,
      };
      if (task.answer.type !== 'artifact') {
        const answer = answers.get(task.id);
        const check = checkTaskAnswer(task, answer ?? '');
        return {
          ...base,
          kind: 'short-answer',
          answered: answer !== undefined && answer.trim().length > 0,
          score: check.verdict === 'correct' ? 1 : 0,
          check,
        };
      }
      const evidence = practice.get(task.id);
      const score =
        evidence?.assessment?.score ?? evidence?.selfAssessment ?? null;
      const source =
        evidence?.assessment?.source ??
        (evidence?.selfAssessment !== undefined ? 'self' : null);
      return {
        ...base,
        kind: 'practice',
        artifactKind: task.answer.kind,
        score,
        source,
        selfAssessment: evidence?.selfAssessment ?? null,
      };
    });
  const pending = rows.filter((row) => row.score === null);
  const knownScore = rows.reduce((sum, row) => sum + (row.score ?? 0), 0);
  const result: ResultBase = {
    rows,
    knownScore,
    maxScore: examConfig.maxScore,
    possibleScore: {
      min: knownScore,
      max: knownScore + pending.reduce((sum, row) => sum + row.maxScore, 0),
    },
    pendingTaskNumbers: pending.map((row) => row.taskNumber),
    format: examConfig.format,
    grading: examConfig.grading,
    practiceNotice:
      'Официальные баллы практической работы выставляют эксперты. Здесь используются твоя самооценка и принятые тобой предложения ИИ.',
  };
  return pending.length === 0
    ? {
        ...result,
        complete: true,
        primaryScore: knownScore,
        grade: gradeForScore(knownScore),
      }
    : { ...result, complete: false, primaryScore: null, grade: null };
}
