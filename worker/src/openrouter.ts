import { routerAiExecution } from '../../src/core/ai-execution';
import { routerAiProfile } from './model-profiles';
import { parseAnthropicGrade } from './anthropic-response';
import { z } from '../../src/core/zod';
import { aiServiceId } from '../../src/core/ai-service';
import type { PreparedRequest } from './prepare-request';
import { buildPrompt } from './prompts';
import { parseGrade } from './grade-response';
import { streamResponse } from './provider-stream';
import {
  CallScope,
  discard,
  readText,
  safeFailure,
  TransportError,
} from './transport';

export interface OpenRouterEnv {
  AI_PROVIDER?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
  ROUTERAI_API_KEY?: string | undefined;
  AI_MODEL_PRIMARY: string;
  AI_MODEL_FALLBACK: string;
  SITE_ORIGIN: string;
}
export interface OpenRouterClient {
  respond(prepared: PreparedRequest, signal: AbortSignal): Promise<Response>;
}

const model = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u)
  .max(200);
const configSchema = z
  .object({
    API_KEY: z.string().regex(/^[!-~]+$/u),
    AI_MODEL_PRIMARY: model,
    AI_MODEL_FALLBACK: model,
    SITE_ORIGIN: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          url.origin === value &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
  })
  .refine((value) => value.AI_MODEL_PRIMARY !== value.AI_MODEL_FALLBACK);
const maxTokens = {
  'stream-feedback': 700,
  'part2-grade': 500,
  'variant-summary': 1200,
};
/** Credentials and the two-model allowlist come only from server configuration. */
export function createOpenRouter(
  env: OpenRouterEnv,
  transport: typeof fetch = fetch,
): OpenRouterClient {
  let service: ReturnType<typeof aiServiceId>;
  try {
    service = aiServiceId(env.AI_PROVIDER);
  } catch {
    throw new TransportError('configuration');
  }
  const endpoint =
    service === 'routerai'
      ? 'https://routerai.ru/api/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
  const parsed = configSchema.safeParse({
    ...env,
    API_KEY:
      service === 'routerai' ? env.ROUTERAI_API_KEY : env.OPENROUTER_API_KEY,
  });
  if (!parsed.success) throw new TransportError('configuration');
  const config = parsed.data;
  return {
    async respond(prepared, signal) {
      let scope = new CallScope(
        signal,
        service === 'routerai' ? routerAiExecution.attemptTimeoutMs : 30_000,
      );
      let streaming = false;
      try {
        scope.check();
        const prompt = buildPrompt(prepared);
        const stream = prepared.mode !== 'part2-grade';
        for (
          let attempt = 0;
          attempt <
          (service === 'routerai' ? routerAiExecution.maxAttempts : 2);
          attempt++
        ) {
          if (attempt > 0 && service === 'routerai') {
            scope.close();
            scope = new CallScope(signal, routerAiExecution.attemptTimeoutMs);
          }
          scope.check();
          const selectedModel =
            attempt === 0 ? config.AI_MODEL_PRIMARY : config.AI_MODEL_FALLBACK;
          const profile =
            service === 'routerai' ? routerAiProfile(selectedModel) : undefined;
          const native = profile?.native === true;
          const pending = transport(
            native ? 'https://routerai.ru/api/v1/messages' : endpoint,
            {
              method: 'POST',
              // Workers supports manual/follow only. Reject 3xx below without following.
              redirect: 'manual',
              signal: scope.signal,
              headers: {
                'Content-Type': 'application/json',
                ...(native
                  ? {
                      'x-api-key': config.API_KEY,
                      'anthropic-version': '2023-06-01',
                    }
                  : { Authorization: `Bearer ${config.API_KEY}` }),
                'HTTP-Referer': config.SITE_ORIGIN,
                'X-Title': 'OGE Informatics',
              },
              body: JSON.stringify({
                model: selectedModel,
                ...(native
                  ? {
                      system: prompt.messages[0].content,
                      messages: prompt.messages.slice(1),
                      output_config: { effort: profile.effort },
                    }
                  : {
                      messages: prompt.messages,
                      ...(profile
                        ? { reasoning: { effort: profile.effort } }
                        : {}),
                    }),
                provider: { data_collection: 'deny' },
                max_tokens:
                  service === 'routerai'
                    ? routerAiExecution.maxTokens
                    : maxTokens[prepared.mode],
                // Selected RouterAI endpoints do not advertise temperature support.
                ...(service === 'openrouter' ? { temperature: 0.3 } : {}),
                stream,
                ...(stream || native
                  ? {}
                  : { response_format: { type: 'json_object' } }),
              }),
            },
          );
          void pending.then(
            (response) => {
              if (scope.signal.aborted) discard(response.body);
            },
            () => undefined,
          );
          const response = await scope.wait(pending);
          if (!response.ok) {
            discard(response.body);
            if (
              attempt === 0 &&
              (response.status === 429 || response.status >= 500)
            )
              continue;
            throw new TransportError('upstream');
          }
          const media = response.headers
            .get('Content-Type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase();
          if (stream) {
            if (media !== 'text/event-stream') {
              discard(response.body);
              throw new TransportError('invalid-response');
            }
            const result = streamResponse(response, scope, native);
            streaming = true;
            return result;
          }
          try {
            if (media !== 'application/json') {
              discard(response.body);
              throw new TransportError('invalid-response');
            }
            return Response.json(
              (native ? parseAnthropicGrade : parseGrade)(
                await readText(response, scope),
                prepared.assessment,
              ),
            );
          } catch (cause) {
            if (
              attempt === 0 &&
              cause instanceof TransportError &&
              cause.code === 'invalid-response'
            )
              continue;
            throw cause;
          }
        }
        throw new TransportError('upstream');
      } catch (cause) {
        throw safeFailure(cause);
      } finally {
        if (!streaming) scope.close();
      }
    },
  };
}
