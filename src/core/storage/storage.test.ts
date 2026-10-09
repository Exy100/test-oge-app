import { describe, expect, it } from 'vitest';
import { LocalStore, JOURNAL } from './store';
import { SessionCache, CACHE_KEY } from './cache';
import {
  defaults,
  PREFIX,
  parseBackup,
  parseArea,
  areaNames,
  areaLabels,
} from './schemas';
import type { StoragePort } from './store';
class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  failAt = Infinity;
  writes = 0;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (++this.writes >= this.failAt)
      throw new DOMException('Full', 'QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const backup = () => ({
  format: 'oge-informatics',
  version: 1,
  areas: defaults(),
  aiCache: { version: 1, entries: [] },
});
describe('хранилище', () => {
  it('переносит старую тему и сохраняет чужие данные', () => {
    const port = new MemoryStorage();
    port.setItem('oge.theme', 'dark');
    port.setItem('neighbor', 'keep');
    const store = new LocalStore(() => port);
    expect(store.read('settings').theme).toBe('dark');
    expect(port.getItem('oge.theme')).toBeNull();
    expect(new LocalStore(() => port).read('settings').theme).toBe('dark');
    expect(port.getItem('neighbor')).toBe('keep');
  });
  it('мигрирует объект v0, новая настройка приоритетнее старой', () => {
    const port = new MemoryStorage();
    port.setItem(
      PREFIX + 'settings',
      JSON.stringify({ version: 0, theme: 'light' }),
    );
    port.setItem('oge.theme', 'dark');
    const store = new LocalStore(() => port);
    expect(store.read('settings')).toEqual({
      ...defaults().settings,
      theme: 'light',
    });
    expect(JSON.parse(port.getItem(PREFIX + 'settings') ?? '')).toEqual(
      store.read('settings'),
    );
  });
  for (const area of areaNames)
    it(`сбрасывает только битую область ${area}`, () => {
      const port = new MemoryStorage();
      const data = defaults();
      for (const name of areaNames)
        port.setItem(PREFIX + name, JSON.stringify(data[name]));
      port.setItem(PREFIX + area, '{broken');
      const store = new LocalStore(() => port);
      expect(store.read(area)).toEqual(data[area]);
      expect(store.messages().join(' ')).toContain(areaLabels[area]);
      expect(port.getItem(PREFIX + area)).toBeNull();
      expect(store.snapshot()).toEqual(data);
    });
  it('работает в памяти при отказе доступа', () => {
    const store = new LocalStore(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    store.write('settings', { ...defaults().settings, fontSize: 150 });
    expect(store.read('settings').fontSize).toBe(150);
    expect(store.memoryOnly).toBe(true);
    expect(store.messages()).toHaveLength(1);
    expect(store.clear()).toBe(false);
  });
  it('сохраняет в памяти данные при квоте во время миграции', () => {
    const port = new MemoryStorage();
    port.setItem('oge.theme', 'dark');
    port.setItem(
      PREFIX + 'aiConsent',
      JSON.stringify({ version: 1, enabled: true }),
    );
    port.failAt = 3;
    const store = new LocalStore(() => port);
    expect(store.memoryOnly).toBe(true);
    expect(store.read('settings').theme).toBe('dark');
    expect(store.read('aiConsent').enabled).toBe(true);
    expect(port.getItem('oge.theme')).toBe('dark');
  });
  it('не теряет предыдущие данные при переполнении записи', () => {
    const port = new MemoryStorage();
    const store = new LocalStore(() => port);
    port.failAt = 1;
    store.write('settings', { ...defaults().settings, theme: 'dark' });
    store.write('aiConsent', { version: 1, enabled: true });
    expect(store.read('settings').theme).toBe('dark');
    expect(store.read('aiConsent').enabled).toBe(true);
    expect(store.memoryOnly).toBe(true);
  });
  for (const stop of [1, 2, 4, 8])
    it(`восстанавливает импорт при прерывании записи ${String(stop)}`, () => {
      const port = new MemoryStorage();
      const original = new LocalStore(() => port);
      const next = defaults();
      next.settings.theme = 'dark';
      next.aiConsent.enabled = true;
      port.failAt = stop;
      original.replace(next);
      expect(original.snapshot()).toEqual(next);
      expect(original.memoryOnly).toBe(true);
      port.failAt = Infinity;
      const recovered = new LocalStore(() => port);
      expect(recovered.snapshot()).toEqual(stop === 1 ? defaults() : next);
      expect(port.getItem(JOURNAL)).toBeNull();
    });
  it('удаляет только свои области и защищает состояние от мутации вызывающим кодом', () => {
    const port = new MemoryStorage();
    const store = new LocalStore(() => port);
    store.replace(defaults());
    port.setItem('other', 'keep');
    const data = store.read('settings');
    data.theme = 'dark';
    expect(store.read('settings').theme).toBe('system');
    expect(store.clear()).toBe(true);
    expect([...port.values.keys()]).toEqual(['other']);
  });
  it('вызывает подписчиков и синхронизирует внешние изменения', () => {
    const port = new MemoryStorage();
    const store = new LocalStore(() => port);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });
    port.setItem(
      PREFIX + 'settings',
      JSON.stringify({ ...defaults().settings, theme: 'dark' }),
    );
    store.refresh();
    expect(calls).toBe(1);
    expect(store.read('settings').theme).toBe('dark');
    unsubscribe();
    store.clear();
    expect(calls).toBe(1);
  });
});
describe('импорт', () => {
  it('принимает полный экспорт', () => {
    expect(parseBackup(JSON.stringify(backup()))).toEqual(backup());
  });
  for (const invalid of [
    '{',
    'null',
    '{}',
    JSON.stringify({ ...backup(), version: 2 }),
    JSON.stringify({ ...backup(), name: 'Иван' }),
    JSON.stringify({
      ...backup(),
      areas: { ...defaults(), aiConsent: { version: 1, enabled: 'yes' } },
    }),
  ])
    it(`отклоняет неверный файл ${invalid.slice(0, 35)}`, () => {
      expect(() => parseBackup(invalid)).toThrow();
    });
  it('ограничивает размер в байтах до разбора', () => {
    expect(() => parseBackup('я'.repeat(1_000_001))).toThrow('2 МБ');
  });
  it('не принимает отрицательную статистику, лишние поля и дубликаты', () => {
    const row = {
      taskNumber: 1,
      attempts: 1,
      correct: 2,
      lastActivity: '2026-10-09T00:00:00Z',
    };
    expect(() =>
      parseArea('streamStats', { version: 1, entries: [row] }),
    ).toThrow();
    expect(() =>
      parseArea('streamStats', {
        version: 1,
        entries: [
          { ...row, correct: 1 },
          { ...row, correct: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseArea('settings', { ...defaults().settings, email: 'x' }),
    ).toThrow();
  });
});
describe('кэш сессии', () => {
  it('различает режим, задачу и хэш ответа; не сохраняет исходный ответ', async () => {
    const port = new MemoryStorage();
    const cache = new SessionCache(() => port);
    await cache.set('review', 'task-1', 'Мой ответ', 'Разбор');
    expect(await cache.get('review', 'task-1', 'Мой ответ')).toBe('Разбор');
    expect(await cache.get('hint', 'task-1', 'Мой ответ')).toBeUndefined();
    expect(await cache.get('review', 'task-2', 'Мой ответ')).toBeUndefined();
    expect(await cache.get('review', 'task-1', 'Другой ответ')).toBeUndefined();
    expect(port.getItem(CACHE_KEY)).not.toContain('Мой ответ');
    expect(
      await new SessionCache(() => port).get('review', 'task-1', 'Мой ответ'),
    ).toBe('Разбор');
    port.setItem('neighbor', 'keep');
    expect(cache.clear()).toBe(true);
    expect(port.getItem('neighbor')).toBe('keep');
  });
  it('ограничивает число записей и работает без sessionStorage', async () => {
    const cache = new SessionCache(() => {
      throw new Error('Blocked');
    });
    for (let index = 0; index < 32; index++)
      await cache.set('hint', 'task', String(index), 'Текст');
    expect(cache.snapshot().entries).toHaveLength(30);
    expect(await cache.get('hint', 'task', '0')).toBeUndefined();
    expect(await cache.get('hint', 'task', '31')).toBe('Текст');
    expect(cache.memoryOnly).toBe(true);
  });
  it('отклоняет слишком большой ответ и очищает неверную схему кэша', async () => {
    const port = new MemoryStorage();
    port.setItem(CACHE_KEY, JSON.stringify({ version: 9 }));
    const cache = new SessionCache(() => port);
    expect(cache.snapshot().entries).toEqual([]);
    expect(port.getItem(CACHE_KEY)).toBeNull();
    await expect(
      cache.set('hint', 't', 'x'.repeat(20001), 'a'),
    ).rejects.toThrow();
  });
});

it('битый JSON кэша удаляется с уведомлением', () => {
  const port = new MemoryStorage();
  port.setItem(CACHE_KEY, '{');
  const cache = new SessionCache(() => port);
  expect(cache.snapshot().entries).toEqual([]);
  expect(cache.notice).toContain('сброшен');
  expect(port.getItem(CACHE_KEY)).toBeNull();
});
it('кэш вытесняет старые записи при достижении лимита байтов', async () => {
  const cache = new SessionCache(() => new MemoryStorage());
  for (let index = 0; index < 20; index++)
    await cache.set('review', 'task', String(index), 'я'.repeat(20000));
  expect(
    new TextEncoder().encode(JSON.stringify(cache.snapshot())).length,
  ).toBeLessThanOrEqual(500000);
  expect(await cache.get('review', 'task', '0')).toBeUndefined();
  expect(await cache.get('review', 'task', '19')).toBe('я'.repeat(20000));
});
it('проверяет ответы, время и практические самооценки в черновике', () => {
  const current = {
    id: 'one',
    variantId: 'V01',
    seed: 'seed',
    variant13: 'document',
    mode: 'exam',
    startedAt: '2026-10-09T00:00:00Z',
    elapsedMs: 300,
    answers: [{ taskNumber: 16, text: 'print(1)', reasoning: '' }],
    assessments: [{ taskNumber: 14, score: 3, source: 'self' }],
    marked: [16],
  };
  expect(parseArea('variantDraft', { version: 1, current })).toEqual({
    version: 1,
    current,
  });
  expect(() =>
    parseArea('variantDraft', {
      version: 1,
      current: {
        ...current,
        answers: [{ taskNumber: 16, text: 'x'.repeat(20001), reasoning: '' }],
      },
    }),
  ).toThrow();
  expect(() =>
    parseArea('variantDraft', {
      version: 1,
      current: { ...current, elapsedMs: -1 },
    }),
  ).toThrow();
  expect(() =>
    parseArea('variantDraft', {
      version: 1,
      current: {
        ...current,
        assessments: [{ taskNumber: 13, score: 3, source: 'self' }],
      },
    }),
  ).toThrow();
});

it('сравнивает время завершения независимо от точности дробных секунд', () => {
  const entry = {
    id: 'one',
    variantId: 'V01',
    seed: 'seed',
    variant13: 'document',
    mode: 'exam',
    startedAt: '2026-10-09T00:00:00Z',
    finishedAt: '2026-10-09T00:00:00.001Z',
    elapsedMs: 1,
    answers: [],
    assessments: [],
    marked: [],
    score: null,
  };
  expect(
    parseArea('variantAttempts', { version: 1, entries: [entry] }),
  ).toEqual({ version: 1, entries: [entry] });
  expect(() =>
    parseArea('variantAttempts', {
      version: 1,
      entries: [
        { ...entry, startedAt: entry.finishedAt, finishedAt: entry.startedAt },
      ],
    }),
  ).toThrow();
});
