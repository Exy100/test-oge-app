import { z } from '../zod.ts';
import { NaturalSchema, TaskNumberSchema, unique } from '../schemas/shared.ts';

export const STREAM_VERSION = 'informatics-stream-v1';
const id = z.string().min(1).max(200);
export const variant13Schema = z.enum(['presentation', 'document']);
const tally = z
  .strictObject({
    attempts: NaturalSchema,
    credit: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .refine((row) => row.credit <= row.attempts);
export const topicStatisticsSchema = z
  .strictObject({
    taskNumber: TaskNumberSchema,
    automatic: z
      .strictObject({ attempts: NaturalSchema, correct: NaturalSchema })
      .refine((row) => row.correct <= row.attempts),
    self: tally,
    aiAccepted: tally,
  })
  .refine((row) =>
    Number.isSafeInteger(
      row.automatic.attempts + row.self.attempts + row.aiAccepted.attempts,
    ),
  )
  .refine((row) =>
    row.taskNumber <= 12
      ? row.self.attempts === 0 && row.aiAccepted.attempts === 0
      : row.automatic.attempts === 0,
  );
export const statisticsSchema = z
  .array(topicStatisticsSchema)
  .max(16)
  .refine((rows) => unique(rows.map((row) => row.taskNumber)));
export const numbersSchema = z
  .array(TaskNumberSchema)
  .min(1)
  .max(16)
  .refine(unique);
export const sourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('generated'),
    generatorId: id,
    taskNumber: TaskNumberSchema.refine((number) => number !== 13),
  }),
  z.strictObject({
    kind: z.literal('curated'),
    generatorId: id,
    taskNumber: z.literal(13),
    variant13: variant13Schema,
    seeds: z.array(z.string().max(200)).min(1).max(1000).refine(unique),
  }),
]);
export const referenceSchema = z.strictObject({
  generatorId: id,
  seed: z.string().max(200),
  taskNumber: TaskNumberSchema,
});
export const reviewStepSchema = z.union([
  z.literal(3),
  z.literal(10),
  z.literal(30),
]);
export const reviewSchema = referenceSchema.extend({
  step: reviewStepSchema,
  dueAfter: z.number().int().min(0).max(30),
});
export const itemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('random'), reference: referenceSchema }),
  z.strictObject({
    kind: z.literal('review'),
    reference: referenceSchema,
    step: reviewStepSchema,
  }),
]);
export const stateSchema = z.strictObject({
  version: z.literal(STREAM_VERSION),
  seed: z.string().max(200),
  numbers: numbersSchema,
  variant13: variant13Schema,
  sources: z
    .array(sourceSchema)
    .min(1)
    .max(1000)
    .refine((rows) => unique(rows.map((row) => row.generatorId))),
  statistics: statisticsSchema,
  reviews: z
    .array(reviewSchema)
    .max(1000)
    .refine((rows) => unique(rows.map((row) => referenceKey(row)))),
  draws: NaturalSchema,
  completed: NaturalSchema,
  current: itemSchema.nullable(),
});
export const outcomeSchema = z.union([
  z.strictObject({ kind: z.literal('automatic'), correct: z.boolean() }),
  z.strictObject({ kind: z.literal('practice'), score: z.null() }),
  z.strictObject({
    kind: z.literal('practice'),
    score: z.number().int().min(0).max(3),
    source: z.enum(['self', 'aiAccepted']),
  }),
  z.strictObject({ kind: z.literal('format-error') }),
  z.strictObject({ kind: z.literal('skip') }),
]);
export type TopicStatistics = z.infer<typeof topicStatisticsSchema>;
export type StreamSource = z.infer<typeof sourceSchema>;
export type StreamReference = z.infer<typeof referenceSchema>;
export type ReviewEntry = z.infer<typeof reviewSchema>;
export type StreamItem = z.infer<typeof itemSchema>;
export type StreamState = z.infer<typeof stateSchema>;
export type StreamOutcome = z.infer<typeof outcomeSchema>;
export type Variant13Choice = z.infer<typeof variant13Schema>;
export function referenceKey(reference: StreamReference): string {
  return JSON.stringify([
    reference.taskNumber,
    reference.generatorId,
    reference.seed,
  ]);
}
