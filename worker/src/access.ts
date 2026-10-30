import { z } from '../../src/core/zod';
import { createOpenRouter } from './openrouter';
import { CallScope, discard, readText, TransportError } from './transport';
import { dailyLimit } from './quota-object';

export interface QuotaNamespace {
  getByName(name: string): {
    fetch(url: string, init: RequestInit): Promise<Response>;
  };
}
export interface AccessEnv {
  AI_ENABLED?: string;
  AI_DAILY_REQUEST_LIMIT?: string;
  AI_IP_HMAC_SECRET?: string;
  AI_QUOTA?: QuotaNamespace;
  OPENROUTER_API_KEY?: string;
  AI_MODEL_PRIMARY?: string;
  AI_MODEL_FALLBACK?: string;
}
const configSchema = z.object({
  AI_ENABLED: z.literal('true'),
  AI_DAILY_REQUEST_LIMIT: dailyLimit,
  AI_IP_HMAC_SECRET: z
    .string()
    .min(32)
    .max(256)
    .regex(/^[!-~]+$/u),
  OPENROUTER_API_KEY: z.string(),
  AI_MODEL_PRIMARY: z.string(),
  AI_MODEL_FALLBACK: z.string(),
  SITE_ORIGIN: z.string(),
});
const decisionSchema = z.discriminatedUnion('allowed', [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({
    allowed: z.literal(false),
    code: z.enum(['rate-minute', 'rate-day', 'budget']),
    retryAfter: z.number().int().min(1).max(86400),
  }),
]);

function canonicalIp(value: string | null): string {
  if (!value || value.length > 45) throw new TransportError('limits');
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value)) {
    const parts = value.split('.');
    if (
      parts.every(
        (part) => String(Number(part)) === part && Number(part) <= 255,
      )
    )
      return value;
  } else if (/^[\da-f:.]+$/iu.test(value) && value.includes(':')) {
    try {
      const address = new URL(`http://[${value}]`).hostname;
      const mapped = /^\[::ffff:([a-f\d]+):([a-f\d]+)\]$/u.exec(address);
      if (mapped) {
        const high = Number.parseInt(mapped[1] ?? '', 16);
        const low = Number.parseInt(mapped[2] ?? '', 16);
        return [high >> 8, high & 255, low >> 8, low & 255].join('.');
      }
      return address;
    } catch {
      throw new TransportError('limits');
    }
  }
  throw new TransportError('limits');
}

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw new TransportError('cancelled');
}

/** Raw IP never crosses the internal namespace boundary or reaches the provider. */
export function createAccess(
  env: AccessEnv & { SITE_ORIGIN: string },
  transport: typeof fetch,
) {
  const config = configSchema.safeParse(env);
  if (!config.success || typeof env.AI_QUOTA?.getByName !== 'function')
    throw new TransportError('configuration');
  const namespace = env.AI_QUOTA;
  const settings = config.data;

  async function allow(command: unknown, signal: AbortSignal) {
    const scope = new CallScope(signal);
    try {
      const pending = namespace
        .getByName('global-v1')
        .fetch('https://quota.internal/allow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
          signal: scope.signal,
        });
      void pending.then(
        (response) => {
          if (scope.signal.aborted) discard(response.body);
        },
        () => undefined,
      );
      const response = await scope.wait(pending);
      if (!response.ok) {
        if (response.body) void response.body.cancel().catch(() => undefined);
        throw new TransportError('limits');
      }
      const decision = decisionSchema.parse(
        JSON.parse(await readText(response, scope)) as unknown,
      );
      if (!decision.allowed)
        throw new TransportError(decision.code, decision.retryAfter);
    } catch (cause) {
      if (
        cause instanceof TransportError &&
        ['rate-minute', 'rate-day', 'budget', 'cancelled', 'timeout'].includes(
          cause.code,
        )
      )
        throw cause;
      throw new TransportError('limits');
    } finally {
      scope.close();
    }
  }

  const client = createOpenRouter(settings, async (url, init) => {
    if (!init?.signal) throw new TransportError('cancelled');
    checkSignal(init.signal);
    // Reserve before EACH billable attempt, including fallback. No refunds on failure.
    await allow({ kind: 'budget' }, init.signal);
    checkSignal(init.signal);
    return transport(url, init);
  });
  return {
    client,
    admit: async (request: Request) => {
      if (request.signal.aborted) throw new TransportError('cancelled');
      // Cloudflare replaces CF-Connecting-IP at the trusted edge. Never trust X-Forwarded-For.
      const ip = canonicalIp(request.headers.get('CF-Connecting-IP'));
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(settings.AI_IP_HMAC_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(ip),
      );
      const digest = Array.from(new Uint8Array(signature), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      await allow({ kind: 'rate', key: digest }, request.signal);
    },
  };
}
