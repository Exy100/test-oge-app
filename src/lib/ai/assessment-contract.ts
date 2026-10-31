import { z } from '../../core/zod';
import { ScoreSchema } from '../../core/schemas/shared';
import { FeedbackError } from './contract';

const id = z.string().min(1).max(200);
const work = {
  solution: z.string().max(3000),
  criteriaAnswers: z
    .record(z.string().min(1).max(100), z.string().max(1500))
    .refine((answers) => Object.keys(answers).length <= 32)
    .optional(),
};
export const part2RequestSchema = z.union([
  z.strictObject({ generatorId: id, seed: z.string().max(200), ...work }),
  z.strictObject({ bankId: id, seed: z.string().max(200).optional(), ...work }),
]);
const text = z.string().trim().min(1).max(4000);
export const gradeSchema = z.strictObject({
  kind: z.enum(['preliminary', 'criteria-help']),
  score: ScoreSchema.nullable(),
  reason: text,
  errors: z.array(z.string().trim().min(1).max(1000)).max(16),
  advice: text,
});
export type AiGrade = z.infer<typeof gradeSchema>;
export type Part2Request = z.infer<typeof part2RequestSchema>;
export function readGrade(value: unknown, taskNumber: number): AiGrade {
  const result = gradeSchema.safeParse(value);
  if (!result.success || ![13, 14, 15, 16].includes(taskNumber))
    throw new FeedbackError('invalid-response');
  const grade = result.data;
  if (
    taskNumber <= 14
      ? grade.kind !== 'criteria-help' || grade.score !== null
      : grade.kind !== 'preliminary' || grade.score === null || grade.score > 2
  )
    throw new FeedbackError('invalid-response');
  return grade;
}
