import { z } from '../../src/core/zod';
import { ScoreSchema } from '../../src/core/schemas/shared';
import type { preparePart2 } from './prepare-request';
import { TransportError } from './transport';

const text = z.string().trim().min(1).max(4000);
const gradeSchema = z.strictObject({
  kind: z.enum(['preliminary', 'criteria-help']),
  score: ScoreSchema.nullable(),
  reason: text,
  errors: z.array(z.string().trim().min(1).max(1000)).max(16),
  advice: text,
});
const completionSchema = z.object({
  choices: z.tuple([
    z.object({
      message: z.object({ content: z.string().max(12_000) }),
      finish_reason: z.literal('stop'),
    }),
  ]),
});

/** The model cannot choose its grading kind or turn missing evidence into a zero. */
export function parseGrade(
  raw: string,
  assessment: ReturnType<typeof preparePart2>['assessment'],
) {
  try {
    const envelope = completionSchema.parse(JSON.parse(raw) as unknown);
    const grade = gradeSchema.parse(
      JSON.parse(envelope.choices[0].message.content) as unknown,
    );
    if (
      assessment.kind === 'criteria-help'
        ? grade.kind !== 'criteria-help' || grade.score !== null
        : grade.kind !== 'preliminary' ||
          grade.score === null ||
          grade.score > assessment.maxScore
    )
      throw new TransportError('invalid-response');
    return grade;
  } catch {
    throw new TransportError('invalid-response');
  }
}
