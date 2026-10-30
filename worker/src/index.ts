import { prepareRequests, PreparationError } from './prepare-request';
import { buildPrompt } from './prompts';
import type { OpenRouterClient } from './openrouter';
import { TransportError } from './transport';
import { createAccess, type AccessEnv } from './access';

export { createOpenRouter } from './openrouter';
export { AiQuota } from './quota-object';

interface Env extends AccessEnv {
  SITE_ORIGIN: string;
}
const MAX_BODY_BYTES = 8192;
const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  Vary: 'Origin',
};

class RequestError extends Error {
  constructor(readonly status: 400 | 413) {
    super('Некорректный запрос.');
  }
}
function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: { ...securityHeaders, ...extra },
  });
}
function error(status: number, code: string, message: string, allow?: string) {
  return json(
    { error: { code, message } },
    status,
    allow ? { Allow: allow } : {},
  );
}
function configuredOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' || (local && url.protocol === 'http:'))
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Bound raw bytes before decoding, parsing or validating untrusted input. */
async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length !== null) {
    if (!/^\d+$/u.test(length)) throw new RequestError(400);
    if (Number(length) > MAX_BODY_BYTES) throw new RequestError(413);
  }
  if (!request.body) throw new RequestError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          throw new RequestError(413);
        }
        throw new RequestError(413);
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (cause) {
    if (cause instanceof RequestError) throw cause;
    throw new RequestError(400);
  } finally {
    reader.releaseLock();
  }
}

export function createWorker(
  client?: OpenRouterClient,
  admit?: (request: Request) => Promise<void>,
) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const origin = configuredOrigin(env.SITE_ORIGIN);
      if (!origin)
        return error(503, 'configuration', 'Сервис разбора недоступен.');
      const url = new URL(request.url);
      const health = url.pathname === '/api/ai/health';
      const suppliedOrigin = request.headers.get('Origin');
      // Same-origin GET fetches may omit Origin. POSTs must supply it explicitly.
      if (
        suppliedOrigin !== origin &&
        !(
          health &&
          request.method === 'GET' &&
          suppliedOrigin === null &&
          url.origin === origin
        )
      )
        return error(403, 'origin', 'Запрос с этого сайта не разрешён.');
      const prepare = Object.entries(prepareRequests).find(
        ([path]) => path === url.pathname,
      )?.[1];
      if (!health && !prepare) return error(404, 'route', 'Маршрут не найден.');
      const method = health ? 'GET' : 'POST';
      if (request.method !== method)
        return error(405, 'method', 'Метод запроса не поддерживается.', method);
      if (health) return json({ enabled: Boolean(client) });
      const media = request.headers
        .get('Content-Type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      const encoding = request.headers.get('Content-Encoding')?.toLowerCase();
      if (media !== 'application/json' || (encoding && encoding !== 'identity'))
        return error(
          415,
          'media-type',
          'Нужен JSON в кодировке UTF-8 без сжатия.',
        );
      try {
        await admit?.(request);
        const body = await readJson(request);
        if (!prepare) throw new PreparationError(500);
        const prepared = prepare(body);
        if (client) {
          const response = await client.respond(prepared, request.signal);
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries(securityHeaders))
            headers.set(name, value);
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        }
        buildPrompt(prepared);
      } catch (cause) {
        if (cause instanceof TransportError)
          return json(
            { error: { code: cause.code, message: cause.message } },
            cause.status,
            cause.retryAfter ? { 'Retry-After': String(cause.retryAfter) } : {},
          );
        if (cause instanceof PreparationError)
          return error(
            cause.status,
            cause.status === 400 ? 'request' : 'task-unavailable',
            cause.status === 400
              ? 'Проверь задание, формат ответа и поля запроса.'
              : 'Не удалось проверить задание. Попробуй ещё раз.',
          );
        if (!(cause instanceof RequestError)) throw cause;
        return error(
          cause.status,
          cause.status === 413 ? 'body-size' : 'request',
          cause.status === 413
            ? 'Размер запроса превышает 8 КБ.'
            : 'Не удалось прочитать JSON запроса.',
        );
      }
      // Task and messages are prepared locally; no provider is connected yet.
      return error(
        503,
        'ai-disabled',
        'ИИ отключён. Доступен локальный пример на сайте.',
      );
    },
  };
}

/** Enabling requires an explicit server flag and all quota/provider settings. */
export function createConfiguredWorker(transport: typeof fetch = fetch) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (env.AI_ENABLED !== 'true') return createWorker().fetch(request, env);
      try {
        const access = createAccess(env, transport);
        return await createWorker(access.client, access.admit).fetch(
          request,
          env,
        );
      } catch {
        return createWorker(undefined, () => {
          throw new TransportError('configuration');
        }).fetch(request, env);
      }
    },
  };
}

export default createConfiguredWorker();
