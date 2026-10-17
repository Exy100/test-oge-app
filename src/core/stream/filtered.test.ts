import { expect, test } from 'vitest';
import {
  createStreamSession,
  configureStream,
  nextStreamTask,
  recordStreamResult,
  restoreStreamState,
  referenceKey,
} from './index';
import {
  defaultStreamFilters,
  nextFilteredStreamTask,
  matchesStreamFilters,
} from './filtered';
import { streamSources, resolveStreamTask } from './catalog';
import { bankTasks } from '../banks';
import type { TaskNumber } from '../types';

const sources = streamSources();
function session(numbers: TaskNumber[] = [1]) {
  return createStreamSession('filters-test', { sources, numbers });
}
const defaults = defaultStreamFilters();
test('extended filters configure the stream without leaking UI fields into its strict state', () => {
  const state = configureStream(session(), { ...defaults, numbers: [1, 2] });
  expect(state.numbers).toEqual([1, 2]);
  expect(restoreStreamState(state)).toEqual(state);
  expect(state).not.toHaveProperty('topic');
});
for (const number of Array.from(
  { length: 16 },
  (_, index) => (index + 1) as TaskNumber,
)) {
  test(`computed difficulty and topic selection for №${String(number)}`, () => {
    const input = session([number]);
    const task = resolveStreamTask(nextStreamTask(input).current.reference);
    const filters = {
      ...defaults,
      numbers: [number],
      difficulty: task.difficulty,
      topic: task.topics[0] ?? '',
    };
    const saved = JSON.stringify(input);
    const selected = nextFilteredStreamTask(input, filters);
    expect(selected.state.current).not.toBeNull();
    if (!selected.state.current) throw new Error('Нет задания.');
    const actual = resolveStreamTask(selected.state.current.reference);
    expect(actual.difficulty).toBe(task.difficulty);
    expect(actual.topics).toContain(filters.topic);
    expect(JSON.stringify(input)).toBe(saved);
    expect(nextFilteredStreamTask(input, filters)).toEqual(selected);
    expect(nextFilteredStreamTask(selected.state, filters).state).toEqual(
      selected.state,
    );
  });
}
test('empty and partial intersections do not silently issue other topics or difficulty', () => {
  const filters = {
    ...defaults,
    numbers: [1, 2] as TaskNumber[],
    topic: 'Кодирование',
  };
  const selected = nextFilteredStreamTask(session([1, 2]), filters);
  expect(selected.unavailable).toEqual([1]);
  expect(selected.state.current?.reference.taskNumber).toBe(2);
  const absent = nextFilteredStreamTask(session([1]), {
    ...filters,
    numbers: [1],
  });
  expect(absent.state.current).toBeNull();
  expect(absent.state.draws).toBe(0);
  const easyDocument = nextFilteredStreamTask(session([13]), {
    ...defaults,
    numbers: [13],
    difficulty: 1,
    variant13: 'document',
  });
  expect(easyDocument.state.current).toBeNull();
  expect(easyDocument.unavailable).toEqual([13]);
});
test('both №13 banks select actual matching tasks, with all filters respected', () => {
  for (const variant13 of ['presentation', 'document'] as const) {
    const filters = {
      ...defaults,
      numbers: [13] as TaskNumber[],
      variant13,
      difficulty: 2 as const,
    };
    const selected = nextFilteredStreamTask(session([13]), filters);
    if (!selected.state.current) throw new Error('Нет задания банка.');
    const task = resolveStreamTask(selected.state.current.reference);
    expect(task.variant13).toBe(variant13);
    expect(task.difficulty).toBe(2);
    expect(bankTasks.some((entry) => entry.id === task.id)).toBe(true);
  }
});
test('review-only preserves the exact 3/10/30 schedule, matching filters and statistics', () => {
  const active = nextStreamTask(session([1]));
  const original = active.current.reference;
  let state = recordStreamResult(active, { kind: 'automatic', correct: false });
  const reviewFilters = {
    ...defaults,
    numbers: [1] as TaskNumber[],
    reviewOnly: true,
  };
  const pending = nextFilteredStreamTask(state, reviewFilters);
  expect(pending.state.current).toBeNull();
  expect(pending.waiting).toBe(3);
  expect(pending.state).toEqual(state);
  for (let index = 0; index < 3; index += 1)
    state = recordStreamResult(nextStreamTask(state), { kind: 'skip' });
  const review = nextFilteredStreamTask(state, reviewFilters).state;
  expect(review.current?.kind).toBe('review');
  expect(review.current?.reference).toEqual(original);
  const wrongTopic = nextFilteredStreamTask(
    { ...review, current: null },
    { ...reviewFilters, topic: 'Кодирование' },
  );
  expect(wrongTopic.state.current).toBeNull();
  expect(wrongTopic.waiting).toBeNull();
  expect(wrongTopic.state.reviews).toEqual(review.reviews);
  const success = recordStreamResult(review, {
    kind: 'automatic',
    correct: true,
  });
  expect(success.reviews[0]?.dueAfter).toBe(10);
  expect(success.statistics[0]?.automatic).toEqual({ attempts: 2, correct: 1 });
  expect(nextFilteredStreamTask(success, reviewFilters).waiting).toBe(10);
});
test('review-only on an untouched session is empty and never invents errors', () => {
  const state = session();
  expect(
    nextFilteredStreamTask(state, {
      ...defaults,
      numbers: [1],
      reviewOnly: true,
    }),
  ).toEqual({ state, unavailable: [], waiting: null });
});
test('candidate boundary rejects unknown sources, wrong numbers and curated seeds', () => {
  const state = session([1, 13]);
  for (const reference of [
    { generatorId: 'unknown', taskNumber: 1 as const, seed: 'seed' },
    {
      generatorId:
        sources.find((source) => source.taskNumber === 1)?.generatorId ?? '',
      taskNumber: 2 as const,
      seed: 'seed',
    },
    {
      generatorId:
        sources.find(
          (source) =>
            source.kind === 'curated' && source.variant13 === 'presentation',
        )?.generatorId ?? '',
      taskNumber: 13 as const,
      seed: 'missing',
    },
  ])
    expect(() => nextStreamTask(state, { candidates: [reference] })).toThrow();
  const number2 = nextStreamTask(session([2])).current.reference;
  expect(() => nextStreamTask(session(), { candidates: [number2] })).toThrow();
});
test('candidate weights apply to numbers, not the number of matching sources', () => {
  const state = session([1, 2]);
  const candidates = sources
    .filter((source) => [1, 2].includes(source.taskNumber))
    .map((source) => ({
      generatorId: source.generatorId,
      taskNumber: source.taskNumber,
      seed: 'candidate',
    }));
  const totals = new Map<number, number>();
  for (let index = 0; index < 500; index += 1) {
    const result = nextStreamTask(
      { ...state, seed: `distribution-${String(index)}` },
      { candidates },
    );
    const number = result.current?.reference.taskNumber ?? 0;
    totals.set(number, (totals.get(number) ?? 0) + 1);
  }
  expect(Math.abs((totals.get(1) ?? 0) - 250)).toBeLessThan(45);
  expect(totals.get(0)).toBeUndefined();
});
test('a due matching review precedes the filtered random pool; JSON restores it', () => {
  const active = nextStreamTask(session([2]));
  const task = resolveStreamTask(active.current.reference);
  const state = restoreStreamState({
    ...active,
    current: null,
    reviews: [{ ...active.current.reference, step: 3, dueAfter: 0 }],
  });
  const selected = nextFilteredStreamTask(state, {
    ...defaults,
    numbers: [2],
    topic: task.topics[0] ?? '',
    difficulty: task.difficulty,
  }).state;
  expect(selected.current?.kind).toBe('review');
  expect(selected.current && referenceKey(selected.current.reference)).toBe(
    referenceKey(active.current.reference),
  );
  expect(restoreStreamState(JSON.parse(JSON.stringify(selected)))).toEqual(
    selected,
  );
  expect(matchesStreamFilters(task, { ...defaults, numbers: [1] })).toBe(false);
});
