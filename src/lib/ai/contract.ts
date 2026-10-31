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
    readonly code:
      | 'invalid-request'
      | 'work-size'
      | 'invalid-response'
      | 'unavailable'
      | 'consent'
      | 'rate-limit'
      | 'budget'
      | 'network'
      | 'timeout'
      | 'disabled',
  ) {
    super(code);
    this.name = 'FeedbackError';
  }
}

export function feedbackErrorMessage(error: unknown): string {
  if (error instanceof FeedbackError) {
    const messages = {
      'invalid-request':
        'Для разбора нужен краткий ответ до 300 символов и черновик до 1500 символов к заданию №1–12.',
      'work-size':
        'Сократи код или описание до 3000 символов и ответы по критериям до 1500 символов каждый. Весь запрос должен занимать не больше 8 КБ.',
      consent: 'Для отправки ответа нужно твоё согласие.',
      'rate-limit': 'Достигнут лимит разборов. Подожди и попробуй позже.',
      budget: 'Дневной лимит сервиса исчерпан. Попробуй завтра.',
      network:
        'Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз.',
      timeout: 'Разбор не успел загрузиться. Попробуй ещё раз.',
      disabled: 'ИИ отключён. Ты можешь продолжать решать задания без него.',
      'invalid-response':
        'Не удалось получить полный разбор. Попробуй ещё раз.',
      unavailable: 'Сервис разбора временно недоступен. Попробуй позже.',
    };
    return messages[error.code];
  }
  return 'Не удалось открыть разбор. Попробуй ещё раз — твой ответ и черновик сохранены.';
}
