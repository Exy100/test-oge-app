import { routerAiExecution } from '../../src/core/ai-execution';
import { routerAiProfile } from './model-profiles';
import { parseAnthropicGrade } from './anthropic-response';
import { z } from '../../src/core/zod';
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

export interface ChatClient {
  respond(prepared: PreparedRequest, signal: AbortSignal): Promise<Response>;
}
export const modelSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u)
  .max(200);
export const originSchema = z.url().refine((value) => {
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
});
interface ChatOptions {
  endpoint:
    | 'https://openrouter.ai/api/v1/chat/completions'
    | 'https://routerai.ru/api/v1/chat/completions';
  apiKey: string;
  siteOrigin: string;
  models: (prepared: PreparedRequest) => readonly [string, string];
  parameters: Readonly<Record<string, unknown>>;
}
const maxTokens = {
  'stream-feedback': 700,
  'part2-grade': 500,
  'variant-summary': 1200,
};
export function createChatCompletions(
  options: ChatOptions,
  transport: typeof fetch,
): ChatClient {
  const service = options.endpoint.includes('routerai.ru')
    ? 'routerai'
    : 'openrouter';
  const endpoint = options.endpoint;
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
          const selectedModel = options.models(prepared)[attempt === 0 ? 0 : 1];
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
                      'x-api-key': options.apiKey,
                      'anthropic-version': '2023-06-01',
                    }
                  : { Authorization: `Bearer ${options.apiKey}` }),
                'HTTP-Referer': options.siteOrigin,
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
