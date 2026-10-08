import { z } from 'zod';
import { examConfig, practiceTaskNumbers } from '../exam/exam.config';
import { ScoreSchema, TextSchema, unique } from './shared';

const assessment = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('self'), score: ScoreSchema }),
  z.strictObject({ source: z.literal('aiAccepted'), score: ScoreSchema }),
]);
const fields = {
  taskId: TextSchema,
  criteriaAnswers: z
    .array(z.strictObject({ criterionScore: ScoreSchema, answer: z.string() }))
    .refine((items) => unique(items.map((item) => item.criterionScore))),
  selfAssessment: ScoreSchema.optional(),
  assessment: assessment.optional(),
};
const program = {
  code: z.string(),
  localRuns: z.array(
    z.strictObject({
      testId: TextSchema,
      input: z.string(),
      output: z.string(),
      status: z.enum(['completed', 'error', 'cancelled', 'limit']),
      origin: z.literal('userLocal'),
    }),
  ),
};
export const PracticeEvidenceSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('presentation'), ...fields }),
    z.strictObject({ kind: z.literal('document'), ...fields }),
    z.strictObject({ kind: z.literal('spreadsheet'), ...fields }),
    z.strictObject({ kind: z.literal('robot'), ...fields, ...program }),
    z.strictObject({ kind: z.literal('program'), ...fields, ...program }),
  ])
  .superRefine((evidence, context) => {
    const max = examConfig.tasks[practiceTaskNumbers[evidence.kind]].maxScore;
    if (
      (evidence.selfAssessment ?? 0) > max ||
      (evidence.assessment?.score ?? 0) > max ||
      evidence.criteriaAnswers.some((item) => item.criterionScore > max)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Балл превышает максимум этой практической работы.',
      });
    }
    if (
      evidence.assessment?.source === 'self' &&
      evidence.assessment.score !== evidence.selfAssessment
    )
      context.addIssue({
        code: 'custom',
        path: ['assessment'],
        message: 'Принятый балл должен совпадать с самооценкой.',
      });
    if (
      evidence.assessment?.source === 'aiAccepted' &&
      evidence.kind !== 'robot' &&
      evidence.kind !== 'program'
    )
      context.addIssue({
        code: 'custom',
        path: ['assessment'],
        message: 'Для офисного файла ИИ даёт помощь по критериям, а не балл.',
      });
  });
