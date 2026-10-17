import { hashSeed } from '../rng.ts';
import { z } from '../zod.ts';
import type { TaskInstance, TaskNumber } from '../types.ts';
import { resolveStreamTask } from './catalog.ts';
import { nextStreamTask, restoreStreamState } from './index.ts';
import {
  numbersSchema,
  variant13Schema,
  referenceKey,
  type StreamReference,
  type StreamState,
} from './schemas.ts';

export const streamFiltersSchema = z.strictObject({
  numbers: numbersSchema,
  variant13: variant13Schema,
  topic: z.string().max(200),
  difficulty: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  reviewOnly: z.boolean(),
});
export type StreamFilters = z.infer<typeof streamFiltersSchema>;
export function defaultStreamFilters(): StreamFilters {
  return {
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    variant13: 'presentation',
    topic: '',
    difficulty: 0,
    reviewOnly: false,
  };
}
export function matchesStreamFilters(
  task: TaskInstance,
  filters: StreamFilters,
): boolean {
  return (
    filters.numbers.includes(task.taskNumber) &&
    (task.taskNumber !== 13 || task.variant13 === filters.variant13) &&
    (!filters.topic || task.topics.includes(filters.topic)) &&
    (filters.difficulty === 0 || task.difficulty === filters.difficulty)
  );
}
export interface FilteredStreamResult {
  state: StreamState;
  unavailable: TaskNumber[];
  waiting: number | null;
}
/** Bounded deterministic search; every candidate is checked against its actual task data. */
export function nextFilteredStreamTask(
  input: StreamState,
  selection: StreamFilters,
): FilteredStreamResult {
  const filters = streamFiltersSchema.parse(selection);
  const state = restoreStreamState({
    ...input,
    current: null,
    numbers: filters.numbers,
    variant13: filters.variant13,
  });
  const cache = new Map<string, TaskInstance>();
  function matches(reference: StreamReference): boolean {
    if (!filters.numbers.includes(reference.taskNumber)) return false;
    const key = referenceKey(reference);
    let task = cache.get(key);
    if (!task) {
      const { generatorId, taskNumber, seed } = reference;
      task = resolveStreamTask({ generatorId, taskNumber, seed });
      cache.set(key, task);
    }
    return matchesStreamFilters(task, filters);
  }
  if (
    input.current &&
    matches(input.current.reference) &&
    (!filters.reviewOnly || input.current.kind === 'review')
  )
    return {
      state: restoreStreamState({ ...state, current: input.current }),
      unavailable: [],
      waiting: null,
    };
  const relevantReviews = state.reviews.filter(matches);
  const waiting = relevantReviews.length
    ? Math.min(...relevantReviews.map((review) => review.dueAfter))
    : null;
  const reviewState = nextStreamTask(state, {
    reviewOnly: true,
    acceptsReview: matches,
  });
  if (filters.reviewOnly || reviewState.current)
    return { state: reviewState, unavailable: [], waiting };
  if (!filters.topic && filters.difficulty === 0)
    return { state: nextStreamTask(state), unavailable: [], waiting };

  const candidates: StreamReference[] = [];
  for (const source of state.sources) {
    if (
      !filters.numbers.includes(source.taskNumber) ||
      (source.kind === 'curated' && source.variant13 !== filters.variant13)
    )
      continue;
    const seeds =
      source.kind === 'curated'
        ? source.seeds
        : Array.from({ length: 16 }, (_, index) =>
            JSON.stringify([
              'stream-filter-v1',
              hashSeed(state.seed),
              state.draws,
              index,
            ]),
          );
    for (const seed of seeds) {
      const reference = {
        generatorId: source.generatorId,
        taskNumber: source.taskNumber,
        seed,
      };
      if (matches(reference)) {
        candidates.push(reference);
        // A generated source has one candidate, so its chance is independent of hit rate.
        if (source.kind === 'generated') break;
      }
    }
  }
  const unavailable = filters.numbers.filter(
    (number) =>
      !candidates.some((reference) => reference.taskNumber === number),
  );
  return {
    state: nextStreamTask(state, { candidates, acceptsReview: matches }),
    unavailable,
    waiting,
  };
}
