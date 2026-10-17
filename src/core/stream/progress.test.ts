import { expect, test } from 'vitest';
import {
  createStreamSession,
  nextStreamTask,
  type StreamSource,
} from './index';
import {
  recordStoredResult,
  withStreamProgress,
  progressTotals,
} from './progress';
import { LocalStore, JOURNAL, type StoragePort } from '../storage/store';
import { defaults, parseBackup, parseArea, PREFIX } from '../storage/schemas';
import type { TaskNumber } from '../types';

class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  failAfter = Infinity;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (--this.failAfter < 0) throw new Error('Quota');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const now = '2026-10-17T16:00:00.000Z';
const sources: StreamSource[] = [1, 14].map((number) => ({
  kind: 'generated',
  generatorId: `source-${String(number)}`,
  taskNumber: number as 1 | 14,
}));
function task(number: TaskNumber = 1) {
  return nextStreamTask(
    createStreamSession('progress-test', { sources, numbers: [number] }),
  );
}
function fixture() {
  const port = new MemoryStorage();
  const store = new LocalStore(() => port);
  return { port, store };
}
test('accepted result persists immediately, reload does not record another answer, clear resets all', () => {
  const { port, store } = fixture();
  recordStoredResult(store, task(), { kind: 'automatic', correct: true }, now);
  const reopened = new LocalStore(() => port);
  expect(progressTotals(reopened.read('streamStats'))).toMatchObject({
    attempts: 1,
    correct: 1,
    accuracy: 1,
  });
  expect(withStreamProgress(task(), reopened.snapshot()).completed).toBe(1);
  expect(reopened.read('streamStats').streak).toBe(1);
  reopened.clear();
  expect(withStreamProgress(task(), reopened.snapshot()).statistics).toEqual(
    [],
  );
  expect(reopened.read('reviewQueue').entries).toEqual([]);
  expect(reopened.read('streamStats')).toEqual(defaults().streamStats);
});
test('series counts automatic answers, ignores skips, malformed and practical work; error breaks it', () => {
  const { store } = fixture();
  for (const correct of [true, true])
    recordStoredResult(store, task(), { kind: 'automatic', correct }, now);
  const before = store.revision;
  recordStoredResult(store, task(), { kind: 'format-error' }, now);
  expect(store.revision).toBe(before);
  recordStoredResult(store, task(), { kind: 'skip' }, now);
  recordStoredResult(store, task(14), { kind: 'practice', score: null }, now);
  recordStoredResult(
    store,
    task(14),
    { kind: 'practice', source: 'self', score: 1 },
    now,
  );
  expect(store.read('streamStats').streak).toBe(2);
  recordStoredResult(store, task(), { kind: 'automatic', correct: false }, now);
  expect(store.read('streamStats').streak).toBe(0);
  expect(progressTotals(store.read('streamStats')).accuracy).toBeCloseTo(2 / 3);
});
test('normalizes practical points by maximum and keeps accepted AI separate from automatic accuracy', () => {
  const { store } = fixture();
  recordStoredResult(
    store,
    task(14),
    { kind: 'practice', source: 'self', score: 1 },
    now,
  );
  recordStoredResult(
    store,
    task(14),
    { kind: 'practice', source: 'aiAccepted', score: 3 },
    now,
  );
  const row = withStreamProgress(task(), store.snapshot()).statistics[0];
  expect(row?.self).toEqual({ attempts: 1, credit: 1 / 3 });
  expect(row?.aiAccepted).toEqual({ attempts: 1, credit: 1 });
  expect(progressTotals(store.read('streamStats'))).toEqual({
    attempts: 0,
    correct: 0,
    accuracy: null,
    self: 1,
    aiAccepted: 1,
  });
  expect(store.read('streamStats').entries[0]?.lastActivity).toBe(now);
});
test('review intervals 3, 10 and 30 survive a fresh store after every task', () => {
  const { port } = fixture();
  let store = new LocalStore(() => port);
  let state = recordStoredResult(
    store,
    task(),
    { kind: 'automatic', correct: false },
    now,
  );
  for (const interval of [3, 10, 30]) {
    expect(store.read('reviewQueue').entries[0]?.dueAfter).toBe(interval);
    for (let index = 0; index < interval; index++) {
      store = new LocalStore(() => port);
      state = recordStoredResult(
        store,
        nextStreamTask(withStreamProgress(state, store.snapshot())),
        { kind: 'skip' },
        now,
      );
    }
    store = new LocalStore(() => port);
    const review = nextStreamTask(withStreamProgress(state, store.snapshot()));
    expect(review.current.kind).toBe('review');
    expect(review.current.reference).toEqual(task().current.reference);
    state = recordStoredResult(
      store,
      review,
      { kind: 'automatic', correct: true },
      now,
    );
  }
  expect(new LocalStore(() => port).read('reviewQueue').entries).toEqual([]);
});
test('another tab reset cannot resurrect old counters or a completed review', () => {
  const { port, store } = fixture();
  recordStoredResult(store, task(), { kind: 'automatic', correct: false }, now);
  const areas = store.snapshot();
  areas.reviewQueue.entries = areas.reviewQueue.entries.map((entry) => ({
    ...entry,
    dueAfter: 0,
  }));
  store.replace(areas);
  const active = nextStreamTask({
    ...withStreamProgress(task(), store.snapshot()),
    current: null,
  });
  expect(active.current.kind).toBe('review');
  new LocalStore(() => port).clear();
  recordStoredResult(store, active, { kind: 'automatic', correct: true }, now);
  expect(progressTotals(store.read('streamStats')).attempts).toBe(1);
  expect(store.read('reviewQueue').entries).toEqual([]);
});
test('export/import restores statistics, timestamp, series and exact review scheduling', () => {
  const { store } = fixture();
  recordStoredResult(store, task(), { kind: 'automatic', correct: false }, now);
  const data = parseBackup(
    JSON.stringify({
      format: 'oge-informatics',
      version: 1,
      areas: store.snapshot(),
      aiCache: { version: 1, entries: [] },
    }),
  );
  const restored = fixture().store;
  restored.replace(data.areas);
  expect(restored.snapshot()).toEqual(store.snapshot());
});
test('quota keeps consistent in-memory progress; a partial journal recovers both areas', () => {
  const { port, store } = fixture();
  port.failAfter = 2;
  recordStoredResult(store, task(), { kind: 'automatic', correct: false }, now);
  expect(store.memoryOnly).toBe(true);
  expect(store.read('reviewQueue').entries).toHaveLength(1);
  expect(progressTotals(store.read('streamStats')).attempts).toBe(1);
  expect(port.getItem(JOURNAL)).not.toBeNull();
  port.failAfter = Infinity;
  expect(new LocalStore(() => port).snapshot()).toEqual(store.snapshot());
});
test('blocked storage still records every result in memory', () => {
  const store = new LocalStore(() => {
    throw new Error('Blocked');
  });
  recordStoredResult(store, task(), { kind: 'automatic', correct: true }, now);
  recordStoredResult(store, task(), { kind: 'automatic', correct: true }, now);
  expect(progressTotals(store.read('streamStats')).attempts).toBe(2);
  expect(store.messages().join(' ')).toContain('памяти');
});
test('old v1 statistics gain neutral practical counters without inventing a series', () => {
  const { port } = fixture();
  port.setItem(
    PREFIX + 'streamStats',
    JSON.stringify({
      version: 1,
      entries: [{ taskNumber: 1, attempts: 4, correct: 3, lastActivity: now }],
    }),
  );
  const store = new LocalStore(() => port);
  expect(progressTotals(store.read('streamStats')).accuracy).toBe(0.75);
  expect(store.read('streamStats').streak).toBe(0);
  expect(store.read('streamStats').entries[0]?.self.attempts).toBe(0);
});
test('rejects corrupt normalized counters and invalid or duplicated reviews', () => {
  expect(() =>
    parseArea('streamStats', { ...defaults().streamStats, streak: -1 }),
  ).toThrow();
  expect(() =>
    parseArea('streamStats', {
      ...defaults().streamStats,
      entries: [
        {
          taskNumber: 14,
          attempts: 0,
          correct: 0,
          lastActivity: now,
          self: { attempts: 1, credit: 2 },
        },
      ],
    }),
  ).toThrow();
  const review = { ...task().current.reference, step: 3, dueAfter: 31 };
  expect(() =>
    parseArea('reviewQueue', { version: 1, entries: [review] }),
  ).toThrow();
  expect(() =>
    parseArea('reviewQueue', {
      version: 1,
      entries: [
        { ...review, dueAfter: 3 },
        { ...review, dueAfter: 3 },
      ],
    }),
  ).toThrow();
});
test('obsolete review sources do not prevent opening a current catalog', () => {
  const areas = defaults();
  areas.reviewQueue.entries = [
    { generatorId: 'removed', seed: 'x', taskNumber: 1, step: 3, dueAfter: 0 },
  ];
  expect(withStreamProgress(task(), areas).reviews).toEqual([]);
});
