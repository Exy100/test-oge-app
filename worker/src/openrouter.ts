import { z } from '../../src/core/zod';
import {
  createChatCompletions,
  modelSchema,
  originSchema,
  type ChatClient,
} from './chat-completions';
import { TransportError } from './transport';

export interface OpenRouterEnv {
  OPENROUTER_API_KEY: string;
  AI_MODEL_PRIMARY: string;
  AI_MODEL_FALLBACK: string;
  SITE_ORIGIN: string;
}
export type OpenRouterClient = ChatClient;

const configSchema = z
  .object({
    OPENROUTER_API_KEY: z.string().regex(/^[!-~]+$/u),
    AI_MODEL_PRIMARY: modelSchema,
    AI_MODEL_FALLBACK: modelSchema,
    SITE_ORIGIN: originSchema,
  })
  .refine((value) => value.AI_MODEL_PRIMARY !== value.AI_MODEL_FALLBACK);

/** Legacy OpenRouter configuration keeps its existing two-model contract. */
export function createOpenRouter(
  env: OpenRouterEnv,
  transport: typeof fetch = fetch,
): OpenRouterClient {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new TransportError('configuration');
  const config = parsed.data;
  return createChatCompletions(
    {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: config.OPENROUTER_API_KEY,
      siteOrigin: config.SITE_ORIGIN,
      models: () => [config.AI_MODEL_PRIMARY, config.AI_MODEL_FALLBACK],
      parameters: { provider: { data_collection: 'deny' }, temperature: 0.3 },
    },
    transport,
  );
}
