import { requestContracts } from './contracts';

interface Env {
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

export default {
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
    const contract = Object.entries(requestContracts).find(
      ([path]) => path === url.pathname,
    )?.[1];
    if (!health && !contract) return error(404, 'route', 'Маршрут не найден.');
    const method = health ? 'GET' : 'POST';
    if (request.method !== method)
      return error(405, 'method', 'Метод запроса не поддерживается.', method);
    if (health) return json({ enabled: false });
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
      const body = await readJson(request);
      if (!contract?.safeParse(body).success)
        return error(400, 'request', 'Проверь поля и ограничения запроса.');
    } catch (cause) {
      if (!(cause instanceof RequestError)) throw cause;
      return error(
        cause.status,
        cause.status === 413 ? 'body-size' : 'request',
        cause.status === 413
          ? 'Размер запроса превышает 8 КБ.'
          : 'Не удалось прочитать JSON запроса.',
      );
    }
    // No provider is connected in T6.1; valid input must never trigger a paid call.
    return error(
      503,
      'ai-disabled',
      'ИИ отключён. Доступен локальный пример на сайте.',
    );
  },
};
