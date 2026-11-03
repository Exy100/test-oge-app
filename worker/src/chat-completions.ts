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

/** Shared bounded protocol; provider configuration is validated before this factory. */
export function createChatCompletions(
  options: ChatOptions,
  transport: typeof fetch,
): ChatClient {
  return {
    async respond(prepared, signal) {
      const scope = new CallScope(signal);
      let streaming = false;
      try {
        scope.check();
        const prompt = buildPrompt(prepared);
        const stream = prepared.mode !== 'part2-grade';
        const models = options.models(prepared);
        for (let attempt = 0; attempt < 2; attempt++) {
          scope.check();
          const pending = transport(options.endpoint, {
            method: 'POST',
            redirect: 'error',
            signal: scope.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.apiKey}`,
              'HTTP-Referer': options.siteOrigin,
              'X-Title': 'OGE Informatics',
            },
            body: JSON.stringify({
              ...options.parameters,
              model: models[attempt],
              messages: prompt.messages,
              max_tokens: maxTokens[prepared.mode],
              stream,
              ...(stream ? {} : { response_format: { type: 'json_object' } }),
            }),
          });
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
            const result = streamResponse(response, scope);
            streaming = true;
            return result;
          }
          try {
            if (media !== 'application/json') {
              discard(response.body);
              throw new TransportError('invalid-response');
            }
            return Response.json(
              parseGrade(await readText(response, scope), prepared.assessment),
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
