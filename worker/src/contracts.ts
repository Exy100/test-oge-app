import { z } from '../../src/core/zod';
import {
  ScoreSchema,
  TaskNumberSchema,
  unique,
} from '../../src/core/schemas/shared';
import { examConfig } from '../../src/core/exam/exam.config';
import { feedbackRequestSchema } from '../../src/lib/ai/contract';
import { part2RequestSchema } from '../../src/lib/ai/assessment-contract';

const seed = z.string().max(200);
const result = z
  .strictObject({
    n: TaskNumberSchema,
    score: ScoreSchema.nullable(),
    timeSec: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    (row) =>
      row.score === null || row.score <= examConfig.tasks[row.n].maxScore,
  );
const selfAssessment = z
  .strictObject({
    n: TaskNumberSchema.refine((number) => number >= 13),
    score: ScoreSchema.nullable(),
  })
  .refine(
    (row) =>
      row.score === null || row.score <= examConfig.tasks[row.n].maxScore,
  );
const summaryRequest = z
  .strictObject({
    variantSeed: seed,
    results: z
      .array(result)
      .max(16)
      .refine((rows) => unique(rows.map((row) => row.n))),
    part2Self: z
      .array(selfAssessment)
      .max(4)
      .refine((rows) => unique(rows.map((row) => row.n))),
  })
  .refine((value) => value.results.length + value.part2Self.length > 0);

export const requestContracts = {
  '/api/ai/stream-feedback': feedbackRequestSchema,
  '/api/ai/part2-grade': part2RequestSchema,
  '/api/ai/variant-summary': summaryRequest,
};
