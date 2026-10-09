import { boundedCacheSchema, PREFIX } from './schemas';
import type { CacheData } from './schemas';
import type { StorageGetter, StoragePort } from './store';
export const CACHE_KEY = PREFIX + 'aiCache';
export class SessionCache {
  private data: CacheData = { version: 1, entries: [] };
  private port: StoragePort | undefined;
  memoryOnly = false;
  notice = '';
  constructor(getStorage: StorageGetter) {
    try {
      this.port = getStorage();
      const raw = this.port.getItem(CACHE_KEY);
      if (raw) {
        try {
          this.data = boundedCacheSchema.parse(JSON.parse(raw));
        } catch {
          this.notice = 'Повреждённый временный кэш ИИ сброшен.';
          this.port.removeItem(CACHE_KEY);
        }
      }
    } catch {
      this.memoryOnly = true;
    }
  }
  snapshot(): CacheData {
    return structuredClone(this.data);
  }
  replace(value: CacheData) {
    this.data = boundedCacheSchema.parse(value);
    try {
      if (!this.port || this.memoryOnly) throw new Error('Нет доступа');
      this.port.setItem(CACHE_KEY, JSON.stringify(this.data));
    } catch {
      this.memoryOnly = true;
    }
  }
  async key(mode: string, taskId: string, answer: string) {
    if (answer.length > 20000) throw new Error('Ответ слишком длинный.');
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(answer),
    );
    return {
      mode,
      taskId,
      answerHash: Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    };
  }
  async get(mode: string, taskId: string, answer: string) {
    const key = await this.key(mode, taskId, answer);
    return this.data.entries.find(
      (entry) =>
        entry.mode === key.mode &&
        entry.taskId === key.taskId &&
        entry.answerHash === key.answerHash,
    )?.response;
  }
  async set(mode: string, taskId: string, answer: string, response: string) {
    const key = await this.key(mode, taskId, answer);
    const entries = this.data.entries.filter(
      (entry) =>
        !(
          entry.mode === mode &&
          entry.taskId === taskId &&
          entry.answerHash === key.answerHash
        ),
    );
    const incoming = boundedCacheSchema.parse({
      version: 1,
      entries: [{ ...key, response }],
    });
    const next = {
      version: 1 as const,
      entries: [...entries.slice(-29), ...incoming.entries],
    };
    while (new TextEncoder().encode(JSON.stringify(next)).length > 500_000)
      next.entries.shift();
    this.replace(next);
  }
  clear() {
    this.data = { version: 1, entries: [] };
    try {
      if (!this.port) throw new Error('Нет доступа');
      this.port.removeItem(CACHE_KEY);
      return true;
    } catch {
      this.memoryOnly = true;
      return false;
    }
  }
}
