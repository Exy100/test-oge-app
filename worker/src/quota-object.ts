import { z } from '../../src/core/zod';

const minute = 60_000;
export const day = 86_400_000;
export const dailyLimit = z
  .string()
  .regex(/^[1-9]\d*$/u)
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= 1_000_000);

/** Only the storage operations used here; no runtime or Node-specific imports. */
export interface QuotaTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface QuotaStorage extends QuotaTransaction {
  transaction<T>(run: (tx: QuotaTransaction) => Promise<T>): Promise<T>;
}
interface QuotaEnv {
  AI_ENABLED?: string;
  AI_DAILY_REQUEST_LIMIT?: string;
}
const visitsSchema = z.array(z.number().int().nonnegative()).min(1).max(60);
const counterSchema = z.strictObject({
  day: z.number().int().nonnegative(),
  count: z.number().int().nonnegative().max(1_000_000),
});
const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('rate'),
    key: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  z.strictObject({ kind: z.literal('budget') }),
]);
export type QuotaDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: 'rate-minute' | 'rate-day' | 'budget';
      retryAfter: number;
    };

async function schedule(tx: QuotaTransaction, expiry: number) {
  const alarm = await tx.getAlarm();
  if (alarm === null || alarm > expiry) await tx.setAlarm(expiry);
}

/** One named object serializes allowances across all Worker isolates and modes. */
export class AiQuota {
  private readonly storage: QuotaStorage;
  constructor(
    context: { storage: QuotaStorage },
    private readonly env: QuotaEnv,
    private readonly now: () => number = Date.now,
  ) {
    this.storage = context.storage;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (
        request.method !== 'POST' ||
        new URL(request.url).pathname !== '/allow'
      )
        return new Response(null, { status: 404 });
      const limit = dailyLimit.safeParse(this.env.AI_DAILY_REQUEST_LIMIT);
      if (this.env.AI_ENABLED !== 'true' || !limit.success)
        return new Response(null, { status: 503 });
      const raw = await request.text();
      if (raw.length > 256) return new Response(null, { status: 400 });
      const command = commandSchema.safeParse(JSON.parse(raw) as unknown);
      if (!command.success) return new Response(null, { status: 400 });
      const value = command.data;
      const decision = await this.storage.transaction(
        async (tx): Promise<QuotaDecision> => {
          const now = this.now();
          if (!Number.isSafeInteger(now) || now < 0)
            throw new Error('Invalid clock');
          if (value.kind === 'budget') {
            const today = Math.floor(now / day);
            const stored = await tx.get<unknown>('budget');
            const previous =
              stored === undefined ? undefined : counterSchema.parse(stored);
            if (previous && previous.day > today)
              throw new Error('Clock moved backwards');
            const count = previous?.day === today ? previous.count : 0;
            if (count >= limit.data)
              return {
                allowed: false,
                code: 'budget',
                retryAfter: Math.ceil(((today + 1) * day - now) / 1000),
              };
            await tx.put('budget', { day: today, count: count + 1 });
            return { allowed: true };
          }
          const key = 'ip:' + value.key;
          const stored = await tx.get<unknown>(key);
          const previous =
            stored === undefined ? [] : visitsSchema.parse(stored);
          if (
            previous.some(
              (time, index) =>
                time > now || (index > 0 && time < (previous[index - 1] ?? 0)),
            )
          )
            throw new Error('Invalid visit order');
          const visits = previous.filter((time) => time > now - day);
          if (visits.length >= 60)
            return {
              allowed: false,
              code: 'rate-day',
              retryAfter: Math.ceil(((visits[0] ?? now) + day - now) / 1000),
            };
          const recent = visits.filter((time) => time > now - minute);
          if (recent.length >= 10)
            return {
              allowed: false,
              code: 'rate-minute',
              retryAfter: Math.ceil(((recent[0] ?? now) + minute - now) / 1000),
            };
          visits.push(now);
          await tx.put(key, visits);
          await schedule(tx, (visits[0] ?? now) + day);
          return { allowed: true };
        },
      );
      return Response.json(decision, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch {
      return new Response(null, { status: 503 });
    }
  }

  /** Expired pseudonyms are removed even when that client never returns. */
  async alarm(): Promise<void> {
    await this.storage.transaction(async (tx) => {
      const now = this.now();
      const records = await tx.list<unknown>({ prefix: 'ip:' });
      let next = Infinity;
      for (const [key, raw] of records) {
        const visits = visitsSchema
          .parse(raw)
          .filter((time) => time > now - day);
        if (visits.length === 0) await tx.delete(key);
        else {
          await tx.put(key, visits);
          next = Math.min(next, (visits[0] ?? now) + day);
        }
      }
      if (Number.isFinite(next)) await tx.setAlarm(next);
      else await tx.deleteAlarm();
    });
  }
}
