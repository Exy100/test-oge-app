import { z } from '../../src/core/zod';
import {
  createChatCompletions,
  modelSchema,
  originSchema,
} from './chat-completions';
import { TransportError } from './transport';

const taskNumbers = z
  .string()
  .max(80)
  .transform((value) =>
    value.trim() === '' ? [] : value.split(',').map((part) => part.trim()),
  )
  .pipe(
    z
      .array(
        z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']),
      )
      .max(12)
      .refine((values) => new Set(values).size === values.length),
  )
  .transform((values) => values.map(Number));
const configSchema = z
  .object({
    AI_API_BASE_URL: z
      .literal('https://routerai.ru/api/v1')
      .default('https://routerai.ru/api/v1'),
    ROUTERAI_API_KEY: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[!-~]+$/u),
    AI_MODEL_SIMPLE: modelSchema.optional(),
    AI_MODEL_PRIMARY: modelSchema,
    AI_MODEL_FALLBACK: modelSchema,
    AI_SIMPLE_TASK_NUMBERS: taskNumbers.default([]),

    SITE_ORIGIN: originSchema,
  })
  .refine(
    (value) =>
      value.AI_MODEL_PRIMARY !== value.AI_MODEL_FALLBACK &&
      (value.AI_SIMPLE_TASK_NUMBERS.length === 0 ||
        (value.AI_MODEL_SIMPLE !== undefined &&
          value.AI_MODEL_SIMPLE !== value.AI_MODEL_PRIMARY &&
          value.AI_MODEL_SIMPLE !== value.AI_MODEL_FALLBACK)),
  );

/** Routing uses the reconstructed task, never a client-supplied number/model. */
export function createRouterAi(env: unknown, transport: typeof fetch = fetch) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new TransportError('configuration');
  const config = parsed.data;
  return createChatCompletions(
    {
      endpoint: 'https://routerai.ru/api/v1/chat/completions',
      apiKey: config.ROUTERAI_API_KEY,
      siteOrigin: config.SITE_ORIGIN,
      models: (prepared) =>
        prepared.mode === 'stream-feedback' &&
        config.AI_SIMPLE_TASK_NUMBERS.includes(prepared.task.taskNumber)
          ? [
              config.AI_MODEL_SIMPLE ?? config.AI_MODEL_PRIMARY,
              config.AI_MODEL_PRIMARY,
            ]
          : [config.AI_MODEL_PRIMARY, config.AI_MODEL_FALLBACK],
      parameters: {
        provider: { data_collection: 'deny' },
        include_reasoning: false,
      },
    },
    transport,
  );
}
