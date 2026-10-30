import {
  AiQuota,
  type QuotaStorage,
  type QuotaTransaction,
} from '../../worker/src/quota-object';
import type { QuotaNamespace } from '../../worker/src/access';
import { routerEnv } from './openrouter-data';

/** Transactional storage double; the separate runtime suite uses real SQLite. */
export class MemoryQuotaStorage implements QuotaStorage {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  private tail = Promise.resolve();
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(
      structuredClone(this.values.get(key)) as T | undefined,
    );
  }
  put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }
  delete(key: string) {
    return Promise.resolve(this.values.delete(key));
  }
  list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
    return Promise.resolve(
      new Map(
        Array.from(this.values)
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => [key, structuredClone(value) as T]),
      ),
    );
  }
  getAlarm() {
    return Promise.resolve(this.alarm);
  }
  setAlarm(time: number) {
    this.alarm = time;
    return Promise.resolve();
  }
  deleteAlarm() {
    this.alarm = null;
    return Promise.resolve();
  }
  transaction<T>(run: (tx: QuotaTransaction) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const previous = structuredClone(this.values);
      const alarm = this.alarm;
      try {
        return await run(this);
      } catch (cause) {
        this.values = previous;
        this.alarm = alarm;
        throw cause;
      }
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
export const quotaSettings = {
  ...routerEnv,
  AI_ENABLED: 'true',
  AI_DAILY_REQUEST_LIMIT: '1000',
  AI_IP_HMAC_SECRET: 'local-test-pseudonym-secret-32-characters',
};
export function quotaFixture(limit = '1000') {
  const storage = new MemoryQuotaStorage();
  const clock = { now: Date.UTC(2026, 9, 30, 12) };
  const env = { ...quotaSettings, AI_DAILY_REQUEST_LIMIT: limit };
  const object = new AiQuota({ storage }, env, () => clock.now);
  const commands: unknown[] = [];
  const names: string[] = [];
  const namespace: QuotaNamespace = {
    getByName(name) {
      names.push(name);
      return {
        async fetch(url, init) {
          if (typeof init.body !== 'string')
            throw new Error('No quota command');
          commands.push(JSON.parse(init.body) as unknown);
          return object.fetch(new Request(url, init));
        },
      };
    },
  };
  return {
    storage,
    clock,
    env: { ...env, AI_QUOTA: namespace },
    object,
    commands,
    names,
  };
}
