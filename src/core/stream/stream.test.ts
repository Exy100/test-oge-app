import { describe, expect, test } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import fc from 'fast-check';
import {
  createStreamSession,
  nextStreamTask,
  recordStreamResult,
  configureStream,
  restoreStreamState,
  streamDistribution,
  emptyTopicStatistics,
  topicAccuracy,
  referenceKey,
  STREAM_VERSION,
  type StreamState,
  type StreamSource,
  type TopicStatistics,
  type StreamOutcome,
} from './index';
import { streamSources, resolveStreamTask } from './catalog';
import { bankTasks } from '../banks';
import { generators } from '../generators';
import { TaskInstanceSchema } from '../schemas';
import { examConfig } from '../exam/exam.config';
import type { TaskNumber } from '../types';

const numbers: TaskNumber[] = Array.from(
  { length: 16 },
  (_, index) => (index + 1) as TaskNumber,
);
const sources: StreamSource[] = numbers
  .filter((number) => number !== 13)
  .map((taskNumber) => ({
    kind: 'generated',
    generatorId: `fixture-${String(taskNumber)}`,
    taskNumber,
  }));
sources.push(
  {
    kind: 'curated',
    generatorId: 'fixture-presentation',
    taskNumber: 13,
    variant13: 'presentation',
    seeds: ['P01', 'P02'],
  },
  {
    kind: 'curated',
    generatorId: 'fixture-document',
    taskNumber: 13,
    variant13: 'document',
    seeds: ['D01', 'D02'],
  },
);
function automatic(
  number: TaskNumber,
  correct: number,
  attempts = 10,
): TopicStatistics {
  return { ...emptyTopicStatistics(number), automatic: { correct, attempts } };
}
function start(
  selected: readonly TaskNumber[] = [1],
  seed = 'stream-test',
): StreamState {
  return createStreamSession(seed, { sources, numbers: selected });
}
function completeOthers(state: StreamState, count: number): StreamState {
  for (let index = 0; index < count; index += 1) {
    const active = nextStreamTask(state);
    expect(active.current.kind).toBe('random');
    state = recordStreamResult(active, { kind: 'skip' });
  }
  return state;
}
test('default selection is 1–10; parsing, next, format errors and configuration are detached', () => {
  const inputSources = structuredClone(sources);
  const state = createStreamSession('Пример 🧩', { sources: inputSources });
  inputSources.length = 0;
  expect(state.numbers).toEqual(numbers.slice(0, 10));
  expect(state.variant13).toBe('presentation');
  const saved = JSON.stringify(state);
  const active = nextStreamTask(state);
  expect(JSON.stringify(state)).toBe(saved);
  expect(nextStreamTask(active)).toEqual(active);
  expect(recordStreamResult(active, { kind: 'format-error' })).toEqual(active);
  expect(
    configureStream(active, {
      numbers: [...state.numbers].reverse(),
      variant13: 'presentation',
    }),
  ).toEqual(active);
  expect(restoreStreamState(JSON.parse(JSON.stringify(active)))).toEqual(
    active,
  );
  const changed = configureStream(active, {
    numbers: [12, 1],
    variant13: 'presentation',
  });
  expect(changed.current).toBeNull();
  expect(changed.numbers).toEqual([1, 12]);
  expect(changed.draws).toBe(active.draws);
  expect(changed.completed).toBe(0);
  expect(() =>
    recordStreamResult(state, { kind: 'automatic', correct: true }),
  ).toThrow();
});
describe('50/50 probabilities', () => {
  test('no evidence, all correct and identical rates give uniform probabilities', () => {
    for (const statistics of [
      [],
      [automatic(1, 0, 0)],
      [automatic(1, 10), automatic(2, 10)],
      [automatic(1, 5), automatic(2, 10, 20)],
    ]) {
      const distribution = streamDistribution([2, 1], statistics);
      expect(distribution.map((row) => row.probability)).toEqual([
        1 / 2,
        1 / 2,
      ]);
    }
    expect(topicAccuracy(emptyTopicStatistics(16))).toBeNull();
    expect(streamDistribution([16])[0]?.probability).toBe(1);
  });
  test('weak topics get half the mass; unknown topics use the mean observed error rate', () => {
    const statistics = [automatic(1, 10), automatic(2, 0), automatic(4, 0)];
    const result = streamDistribution([3, 2, 1], statistics);
    expect(result.map((row) => row.accuracy)).toEqual([1, 0, null]);
    expect(result.map((row) => row.errorWeight)).toEqual([0, 1, 1 / 2]);
    for (const row of result)
      expect(row.probability).toBeCloseTo(
        0.5 / 3 + (0.5 * row.errorWeight) / (1 + 1 / 2),
        14,
      );
    expect(result).toEqual(
      streamDistribution([1, 2, 3], statistics.slice(0, 2)),
    );
  });
  test('500 evidence sets: independent formula, total one, minimum 0.5/N and input order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: 0, max: 100 }),
          ),
          { minLength: 16, maxLength: 16 },
        ),
        (samples) => {
          const statistics = numbers.map((number, index) => {
            const [attempts, raw] = samples[index] ?? [0, 0];
            const row = emptyTopicStatistics(number);
            if (number <= 12)
              row.automatic = { attempts, correct: Math.min(attempts, raw) };
            else
              row.self = {
                attempts,
                credit:
                  Math.min(attempts, raw) / examConfig.tasks[number].maxScore,
              };
            return row;
          });
          const result = streamDistribution(numbers, statistics);
          const weights = statistics.map((row) => {
            const count = row.automatic.attempts + row.self.attempts;
            return count === 0
              ? null
              : 1 - (row.automatic.correct + row.self.credit) / count;
          });
          const known = weights.filter(
            (weight): weight is number => weight !== null,
          );
          const mean = known.length
            ? known.reduce((sum, weight) => sum + weight, 0) / known.length
            : 0;
          const filled = weights.map((weight) => weight ?? mean);
          const total = filled.reduce((sum, weight) => sum + weight, 0);
          expect(
            result.reduce((sum, row) => sum + row.probability, 0),
          ).toBeCloseTo(1, 13);
          result.forEach((row, index) => {
            expect(row.probability).toBeGreaterThanOrEqual(
              0.5 / numbers.length,
            );
            expect(row.probability).toBeCloseTo(
              total === 0
                ? 1 / numbers.length
                : 0.5 / numbers.length + (0.5 * (filled[index] ?? 0)) / total,
              13,
            );
          });
          expect(
            streamDistribution(
              [...numbers].reverse(),
              [...statistics].reverse(),
            ),
          ).toEqual(result);
        },
      ),
      { seed: 20261015, numRuns: 500 },
    );
  });
  test.each(['no evidence', 'identical rates', 'unequal rates'])(
    'actual engine draws follow probabilities: %s',
    (scenario) => {
      const statistics =
        scenario === 'no evidence'
          ? []
          : [
              automatic(1, scenario === 'unequal rates' ? 10 : 5),
              automatic(2, 5),
            ];
      let state = createStreamSession(`frequency:${scenario}`, {
        sources,
        numbers: [1, 2],
        statistics,
      });
      const expected = streamDistribution(state.numbers, state.statistics);
      const counts = new Map<TaskNumber, number>();
      const draws = 5000;
      for (let index = 0; index < draws; index += 1) {
        const active = nextStreamTask(state);
        const number = active.current.reference.taskNumber;
        counts.set(number, (counts.get(number) ?? 0) + 1);
        state = recordStreamResult(active, { kind: 'skip' });
      }
      for (const row of expected) {
        const error = Math.abs(
          (counts.get(row.taskNumber) ?? 0) - draws * row.probability,
        );
        expect(error).toBeLessThan(
          6 * Math.sqrt(draws * row.probability * (1 - row.probability)),
        );
      }
    },
    30000,
  );
});
test('practice normalizes scores and keeps self/accepted AI distinct; no grade invents no accuracy', () => {
  for (const number of [13, 14, 15, 16] as const) {
    let state = start([number]);
    state = recordStreamResult(nextStreamTask(state), {
      kind: 'practice',
      score: null,
    });
    expect(state.statistics).toEqual([]);
    expect(state.reviews).toEqual([]);
    state = recordStreamResult(nextStreamTask(state), {
      kind: 'practice',
      score: 1,
      source: 'self',
    });
    expect(state.statistics[0]?.self.credit).toBe(
      1 / examConfig.tasks[number].maxScore,
    );
    expect(state.reviews[0]?.step).toBe(3);
    state = recordStreamResult(nextStreamTask(state), {
      kind: 'practice',
      score: examConfig.tasks[number].maxScore,
      source: 'aiAccepted',
    });
    expect(state.statistics[0]?.aiAccepted).toEqual({ attempts: 1, credit: 1 });
    const row = state.statistics[0];
    if (!row) throw new Error('Missing evidence');
    expect(topicAccuracy(row)).toBe(
      (1 + 1 / examConfig.tasks[number].maxScore) / 2,
    );
    expect(row.automatic.attempts).toBe(0);
    expect(() =>
      recordStreamResult(nextStreamTask(state), {
        kind: 'automatic',
        correct: true,
      }),
    ).toThrow();
  }
  expect(() =>
    recordStreamResult(nextStreamTask(start()), {
      kind: 'practice',
      score: null,
    }),
  ).toThrow();
  expect(() =>
    recordStreamResult(nextStreamTask(start([13])), {
      kind: 'practice',
      score: 3,
      source: 'self',
    }),
  ).toThrow();
});
test('a failed reference returns after 3, 10, 30 OTHER completed tasks; final success retires it', () => {
  const original = nextStreamTask(start());
  const reference = original.current.reference;
  let state = recordStreamResult(original, {
    kind: 'automatic',
    correct: false,
  });
  let randomDraws = state.draws;
  for (const gap of [3, 10, 30] as const) {
    expect(state.reviews).toEqual([{ ...reference, step: gap, dueAfter: gap }]);
    state = completeOthers(state, gap);
    randomDraws += gap;
    const active = nextStreamTask(state);
    expect(active.current).toEqual({ kind: 'review', reference, step: gap });
    expect(active.draws).toBe(randomDraws);
    expect(nextStreamTask(active)).toEqual(active);
    expect(recordStreamResult(active, { kind: 'format-error' })).toEqual(
      active,
    );
    state = recordStreamResult(active, { kind: 'automatic', correct: true });
  }
  expect(state.reviews).toEqual([]);
  expect(state.completed).toBe(1 + 3 + 1 + 10 + 1 + 30 + 1);
  expect(state.statistics[0]?.automatic).toEqual({ attempts: 4, correct: 3 });
});
test('wrong reviews restart at 3; skip/unassessed preserve stage and postpone without invented statistics', () => {
  let state = recordStreamResult(nextStreamTask(start()), {
    kind: 'automatic',
    correct: false,
  });
  state = completeOthers(state, 3);
  state = recordStreamResult(nextStreamTask(state), {
    kind: 'automatic',
    correct: true,
  });
  state = completeOthers(state, 10);
  state = recordStreamResult(nextStreamTask(state), {
    kind: 'automatic',
    correct: false,
  });
  expect(state.reviews[0]).toMatchObject({ step: 3, dueAfter: 3 });
  state = completeOthers(state, 3);
  const stats = state.statistics;
  state = recordStreamResult(nextStreamTask(state), { kind: 'skip' });
  expect(state.statistics).toEqual(stats);
  expect(state.reviews[0]).toMatchObject({ step: 3, dueAfter: 3 });
  const practice = createStreamSession('practice', {
    sources,
    numbers: [14],
    reviews: [
      {
        generatorId: 'fixture-14',
        taskNumber: 14,
        seed: 'practice',
        step: 30,
        dueAfter: 0,
      },
    ],
  });
  const unassessed = recordStreamResult(nextStreamTask(practice), {
    kind: 'practice',
    score: null,
  });
  expect(unassessed.reviews[0]).toMatchObject({ step: 30, dueAfter: 3 });
  expect(unassessed.statistics).toEqual([]);
});
test('FIFO, filtered reviews, both №13 banks, deduplication and random draw counter stay independent', () => {
  const p = {
    generatorId: 'fixture-presentation',
    taskNumber: 13 as const,
    seed: 'P01',
    step: 3 as const,
    dueAfter: 0,
  };
  const d = {
    generatorId: 'fixture-document',
    taskNumber: 13 as const,
    seed: 'D01',
    step: 10 as const,
    dueAfter: 0,
  };
  let state = createStreamSession('queue', {
    sources,
    numbers: [1, 13],
    reviews: [d, p],
  });
  expect(nextStreamTask(state).current.reference.generatorId).toBe(
    p.generatorId,
  );
  state = configureStream(state, { numbers: [13], variant13: 'document' });
  const active = nextStreamTask(state);
  expect(active.current).toEqual({
    kind: 'review',
    reference: { generatorId: d.generatorId, taskNumber: 13, seed: 'D01' },
    step: 10,
  });
  state = recordStreamResult(active, {
    kind: 'practice',
    score: 2,
    source: 'self',
  });
  expect(state.draws).toBe(0);
  expect(state.reviews.map((row) => row.step)).toEqual([3, 30]);
  state = configureStream(state, { numbers: [1], variant13: 'presentation' });
  const noQueue = createStreamSession('queue', { sources, numbers: [1] });
  expect(nextStreamTask(state).current).toEqual(
    nextStreamTask(noQueue).current,
  );
  expect(state.reviews).toHaveLength(2);
  const duplicate = {
    generatorId: 'fixture-1',
    taskNumber: 1 as const,
    seed: 'same',
    step: 10 as const,
    dueAfter: 4,
  };
  const pending = nextStreamTask(start());
  pending.current = {
    kind: 'random',
    reference: {
      generatorId: duplicate.generatorId,
      taskNumber: 1,
      seed: 'same',
    },
  };
  pending.reviews = [duplicate];
  const failed = recordStreamResult(pending, {
    kind: 'automatic',
    correct: false,
  });
  expect(failed.reviews).toEqual([{ ...duplicate, step: 3, dueAfter: 3 }]);
  const correct = recordStreamResult(pending, {
    kind: 'automatic',
    correct: true,
  });
  expect(correct.reviews).toEqual([{ ...duplicate, dueAfter: 3 }]);
  const fifo = createStreamSession('fifo', {
    sources,
    numbers: [13],
    reviews: [{ ...p, seed: 'P02' }, p],
  });
  expect(nextStreamTask(fifo).current.reference.seed).toBe('P02');
});
test('queue capacity and statistics overflow fail atomically; absent evidence stays absent', () => {
  const reviews = Array.from({ length: 1000 }, (_, index) => ({
    generatorId: 'fixture-1',
    taskNumber: 1 as const,
    seed: `pending-${String(index)}`,
    step: 30 as const,
    dueAfter: 30,
  }));
  const full = nextStreamTask(
    createStreamSession('capacity', { sources, numbers: [1], reviews }),
  );
  const saved = JSON.stringify(full);
  expect(() =>
    recordStreamResult(full, { kind: 'automatic', correct: false }),
  ).toThrow();
  expect(JSON.stringify(full)).toBe(saved);
  const saturated = nextStreamTask(
    createStreamSession('overflow', {
      sources,
      numbers: [1],
      statistics: [
        automatic(1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      ],
    }),
  );
  expect(() =>
    recordStreamResult(saturated, { kind: 'automatic', correct: true }),
  ).toThrow();
  const unknown = emptyTopicStatistics(14);
  expect(() =>
    streamDistribution(
      [14],
      [{ ...unknown, self: { attempts: 0, credit: 1 } }],
    ),
  ).toThrow();
  expect(() =>
    streamDistribution(
      [14],
      [{ ...unknown, automatic: { attempts: 1, correct: 1 } }],
    ),
  ).toThrow();
  expect(() =>
    streamDistribution(
      [1],
      [{ ...emptyTopicStatistics(1), self: { attempts: 1, credit: 1 } }],
    ),
  ).toThrow();
});
const replaySeeds =
  fc.sample(
    fc.uniqueArray(fc.string({ maxLength: 100 }), {
      minLength: 500,
      maxLength: 500,
    }),
    { seed: 20261015, numRuns: 1 },
  )[0] ?? [];
test.each([0, 1, 2, 3])(
  '500 session seeds, batch %i: stable after JSON restore and permutations, unique generated references',
  (batch) => {
    expect(replaySeeds).toHaveLength(500);
    const seeds = replaySeeds.slice(batch * 125, (batch + 1) * 125);
    expect(seeds).toHaveLength(125);
    for (const seed of seeds) {
      let left = createStreamSession(seed, { sources, numbers });
      let right = createStreamSession(seed, {
        sources: [...sources].reverse(),
        numbers: [...numbers].reverse(),
      });
      const randomKeys = new Set<string>();
      for (let index = 0; index < 20; index += 1) {
        const active = nextStreamTask(left);
        const saved = JSON.stringify(active);
        expect(isDeepStrictEqual(nextStreamTask(right), active)).toBe(true);
        if (
          active.current.kind === 'random' &&
          active.current.reference.taskNumber !== 13
        ) {
          const key = referenceKey(active.current.reference);
          expect(randomKeys.has(key)).toBe(false);
          randomKeys.add(key);
        }
        const outcome: StreamOutcome =
          index % 7 === 0
            ? { kind: 'skip' }
            : active.current.reference.taskNumber <= 12
              ? { kind: 'automatic', correct: index % 3 !== 0 }
              : {
                  kind: 'practice',
                  score:
                    index % 3 === 0
                      ? 0
                      : examConfig.tasks[active.current.reference.taskNumber]
                          .maxScore,
                  source: 'self',
                };
        left = recordStreamResult(active, outcome);
        expect(JSON.stringify(active)).toBe(saved);
        right = restoreStreamState(
          JSON.parse(
            JSON.stringify(recordStreamResult(nextStreamTask(right), outcome)),
          ),
        );
        expect(isDeepStrictEqual(left, right)).toBe(true);
      }
    }
  },
  30000,
);
test.each([
  { label: 'empty', seed: '' },
  { label: 'unicode', seed: 'Информатика 🧩' },
  { label: 'unpaired-surrogate', seed: '\ud800' },
])('versioned sequence golden: $label', ({ seed }) => {
  let state = start(numbers, seed);
  const sequence = [];
  for (let index = 0; index < 12; index += 1) {
    const active = nextStreamTask(state);
    sequence.push(active.current);
    state = recordStreamResult(
      active,
      index === 0
        ? active.current.reference.taskNumber <= 12
          ? { kind: 'automatic', correct: false }
          : { kind: 'practice', score: 0, source: 'self' }
        : { kind: 'skip' },
    );
  }
  expect({
    version: STREAM_VERSION,
    sequence,
    reviews: state.reviews,
  }).toMatchSnapshot();
});
test('real catalogue: all selected generators and 24 curated references resolve, isolation and rejection', () => {
  const catalog = streamSources();
  expect(catalog.filter((source) => source.kind === 'generated')).toHaveLength(
    generators.length,
  );
  for (const generator of generators) {
    const reference = {
      generatorId: generator.id,
      taskNumber: generator.taskNumber,
      seed: 'stream-catalogue',
    };
    const task = resolveStreamTask(reference);
    expect(TaskInstanceSchema.parse(task)).toEqual(task);
    expect(generator.verify(task)).toBe(true);
  }
  for (const original of bankTasks) {
    const reference = {
      generatorId: original.generatorId,
      taskNumber: original.taskNumber,
      seed: original.seed,
    };
    const task = resolveStreamTask(reference);
    expect(task).toEqual(original);
    task.statement = 'Изменённая копия';
    expect(resolveStreamTask(reference)).toEqual(original);
  }
  for (const variant13 of ['presentation', 'document'] as const) {
    let state = createStreamSession('real', {
      sources: catalog,
      numbers,
      variant13,
    });
    for (let index = 0; index < 100; index += 1) {
      const active = nextStreamTask(state);
      const task = resolveStreamTask(active.current.reference);
      expect(task.taskNumber).toBe(active.current.reference.taskNumber);
      expect(task.seed).toBe(active.current.reference.seed);
      if (task.taskNumber === 13) expect(task.variant13).toBe(variant13);
      state = recordStreamResult(active, { kind: 'skip' });
    }
  }
  expect(() =>
    resolveStreamTask({ generatorId: 'unknown', taskNumber: 1, seed: '' }),
  ).toThrow();
  expect(() =>
    resolveStreamTask({
      generatorId: generators[0]?.id ?? '',
      taskNumber: 2,
      seed: '',
    }),
  ).toThrow();
  const first = catalog[0];
  if (!first) throw new Error('Missing source');
  first.generatorId = 'changed';
  expect(streamSources()).not.toEqual(catalog);
});
test('strict invalid boundaries and counters are rejected without mutating input', () => {
  const state = start();
  const corruptions: unknown[] = [
    { ...state, version: 'other' },
    { ...state, seed: 'x'.repeat(201) },
    { ...state, numbers: [] },
    { ...state, numbers: [1, 1] },
    { ...state, numbers: [17] },
    { ...state, sources: [] },
    { ...state, sources: [sources[0], sources[0]] },
    { ...state, numbers: [13], sources: [sources[0]] },
    { ...state, draws: -1 },
    { ...state, draws: NaN },
    { ...state, completed: Infinity },
    { ...state, statistics: [automatic(1, 2, 1)] },
    { ...state, statistics: [automatic(1, 0), automatic(1, 1)] },
    {
      ...state,
      reviews: [
        { generatorId: 'bad', taskNumber: 1, seed: '', step: 3, dueAfter: 0 },
      ],
    },
    {
      ...state,
      reviews: [
        {
          generatorId: 'fixture-1',
          taskNumber: 2,
          seed: '',
          step: 3,
          dueAfter: 0,
        },
      ],
    },
    {
      ...state,
      reviews: [
        {
          generatorId: 'fixture-presentation',
          taskNumber: 13,
          seed: 'bad',
          step: 3,
          dueAfter: 0,
        },
      ],
    },
    {
      ...state,
      current: {
        kind: 'review',
        reference: { generatorId: 'fixture-1', taskNumber: 1, seed: '' },
        step: 3,
      },
    },
    {
      ...state,
      current: {
        kind: 'random',
        reference: { generatorId: 'fixture-2', taskNumber: 2, seed: '' },
      },
    },
    {
      ...state,
      current: {
        kind: 'random',
        reference: { generatorId: 'fixture-1', taskNumber: 1, seed: '' },
      },
    },
    { ...state, extra: true },
  ];
  for (const corrupted of corruptions)
    expect(() => restoreStreamState(corrupted)).toThrow();
  expect(() =>
    nextStreamTask({ ...state, draws: Number.MAX_SAFE_INTEGER }),
  ).toThrow();
  const active = nextStreamTask(state);
  expect(() =>
    recordStreamResult(
      { ...active, completed: Number.MAX_SAFE_INTEGER },
      { kind: 'skip' },
    ),
  ).toThrow();
  expect(() =>
    recordStreamResult(active, {
      kind: 'automatic',
      correct: 'yes',
    } as unknown as StreamOutcome),
  ).toThrow();
  expect(state).toEqual(start());
});
