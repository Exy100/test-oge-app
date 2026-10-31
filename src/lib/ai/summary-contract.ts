import { z } from '../../core/zod';
import {
  ScoreSchema,
  TaskNumberSchema,
  unique,
} from '../../core/schemas/shared';
import { examConfig } from '../../core/exam/exam.config';
import type { ExamAttempt } from '../../core/variants/exam';
import type { VariantScore } from '../../core/scoring';

const score = { n: TaskNumberSchema, score: ScoreSchema.nullable() };
const result = z
  .strictObject({
    ...score,
    timeSec: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .refine(
    (row) =>
      row.score === null || row.score <= examConfig.tasks[row.n].maxScore,
  );
const self = z
  .strictObject(score)
  .refine(
    (row) =>
      row.n >= 13 &&
      (row.score === null || row.score <= examConfig.tasks[row.n].maxScore),
  );
export const summaryRequestSchema = z
  .strictObject({
    variantSeed: z.string().max(200),
    results: z
      .array(result)
      .max(16)
      .refine((rows) => unique(rows.map((row) => row.n))),
    part2Self: z
      .array(self)
      .max(4)
      .refine((rows) => unique(rows.map((row) => row.n))),
  })
  .refine((value) => value.results.length + value.part2Self.length > 0);
export type SummaryRequest = z.infer<typeof summaryRequestSchema>;
export interface SummaryProvider {
  streamSummary(
    request: SummaryRequest,
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

/** Per-task timing was never recorded. Null explicitly means unknown, never invented zero. */
export function buildSummaryRequest(
  attempt: ExamAttempt,
  result: VariantScore,
): SummaryRequest {
  return summaryRequestSchema.parse({
    variantSeed: attempt.seed,
    results: result.rows.map((row) => ({
      n: row.taskNumber,
      score: row.score,
      timeSec: null,
    })),
    part2Self: result.rows
      .filter((row) => row.kind === 'practice' && row.source === 'self')
      .map((row) => ({ n: row.taskNumber, score: row.score })),
  });
}
