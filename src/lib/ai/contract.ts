import { z } from '../../core/zod';

export const feedbackRequestSchema = z
  .strictObject({
    generatorId: z.string().min(1).max(200),
    seed: z.string().max(200),
    answer: z.string().max(300),
    reasoning: z.string().max(1500).optional(),
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 8192,
  );

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

/** Transport boundary: a provider yields markdown and honours cancellation. */
export interface FeedbackProvider {
  streamFeedback(
    request: FeedbackRequest,
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

export class FeedbackError extends Error {
  constructor(
    readonly code: 'invalid-request' | 'invalid-response' | 'unavailable',
  ) {
    super(code);
    this.name = 'FeedbackError';
  }
}

export function feedbackErrorMessage(error: unknown): string {
  if (error instanceof FeedbackError && error.code === 'invalid-request')
    return 'Для разбора нужен краткий ответ до 300 символов и черновик до 1500 символов к заданию №1–12.';
  return 'Не удалось открыть разбор. Попробуй ещё раз — твой ответ и черновик сохранены.';
}
