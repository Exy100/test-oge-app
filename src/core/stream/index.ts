import { Rng, hashSeed } from '../rng.ts';
import { examConfig } from '../exam/exam.config.ts';
import type { TaskNumber } from '../types.ts';
import {
  STREAM_VERSION,
  stateSchema,
  outcomeSchema,
  referenceKey,
  type StreamState,
  type StreamSource,
  type StreamReference,
  type ReviewEntry,
  type StreamOutcome,
  type TopicStatistics,
  type Variant13Choice,
} from './schemas.ts';
import { emptyTopicStatistics, streamDistribution } from './statistics.ts';
export { STREAM_VERSION, referenceKey } from './schemas.ts';
export type {
  StreamState,
  StreamSource,
  StreamReference,
  ReviewEntry,
  StreamItem,
  StreamOutcome,
  TopicStatistics,
  Variant13Choice,
} from './schemas.ts';
export {
  emptyTopicStatistics,
  topicAccuracy,
  streamDistribution,
} from './statistics.ts';
export type { StreamProbability } from './statistics.ts';

export interface CreateStreamOptions {
  sources: readonly StreamSource[];
  numbers?: readonly TaskNumber[];
  variant13?: Variant13Choice;
  statistics?: readonly TopicStatistics[];
  reviews?: readonly ReviewEntry[];
}
export type ActiveStreamState = StreamState & {
  current: NonNullable<StreamState['current']>;
};
const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
function sourceFor(
  state: StreamState,
  reference: StreamReference,
): StreamSource {
  const source = state.sources.find(
    (item) => item.generatorId === reference.generatorId,
  );
  if (
    !source ||
    source.taskNumber !== reference.taskNumber ||
    (source.kind === 'curated' && !source.seeds.includes(reference.seed))
  )
    throw new TypeError('Задание не соответствует источникам потока.');
  return source;
}
function eligible(state: StreamState, source: StreamSource): boolean {
  return (
    state.numbers.includes(source.taskNumber) &&
    (source.kind !== 'curated' || source.variant13 === state.variant13)
  );
}
/** A detached, validated, canonical state; no browser, clock or storage access. */
export function restoreStreamState(input: unknown): StreamState {
  const state = stateSchema.parse(input);
  state.numbers.sort((a, b) => a - b);
  state.statistics.sort((a, b) => a.taskNumber - b.taskNumber);
  state.sources.sort((a, b) => compare(a.generatorId, b.generatorId));
  for (const source of state.sources)
    if (source.kind === 'curated') source.seeds.sort(compare);
  for (const number of state.numbers)
    if (
      !state.sources.some(
        (source) => source.taskNumber === number && eligible(state, source),
      )
    )
      throw new RangeError('Для выбранного номера нет подходящих заданий.');
  for (const review of state.reviews) sourceFor(state, review);
  if (state.current) {
    if (!eligible(state, sourceFor(state, state.current.reference)))
      throw new TypeError('Текущее задание не соответствует выбору номеров.');
    if (state.current.kind === 'random' && state.draws === 0)
      throw new TypeError('Не указан случайный выбор текущего задания.');
    if (state.current.kind === 'review') {
      const current = state.current;
      if (
        !state.reviews.some(
          (review) =>
            referenceKey(review) === referenceKey(current.reference) &&
            review.step === current.step &&
            review.dueAfter === 0,
        )
      )
        throw new TypeError('Текущее повторение отсутствует в очереди.');
    }
  }
  return state;
}
export function createStreamSession(
  seed: string,
  options: CreateStreamOptions,
): StreamState {
  return restoreStreamState({
    version: STREAM_VERSION,
    seed,
    sources: options.sources,
    numbers: options.numbers ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    variant13: options.variant13 ?? 'presentation',
    statistics: options.statistics ?? [],
    reviews: options.reviews ?? [],
    draws: 0,
    completed: 0,
    current: null,
  });
}
export function configureStream(
  input: StreamState,
  selection: { numbers: readonly TaskNumber[]; variant13: Variant13Choice },
): StreamState {
  const state = restoreStreamState(input);
  const numbers = [...selection.numbers].sort((a, b) => a - b);
  if (
    JSON.stringify(numbers) !== JSON.stringify(state.numbers) ||
    selection.variant13 !== state.variant13
  )
    state.current = null;
  return restoreStreamState({ ...state, ...selection });
}
export function nextStreamTask(input: StreamState): ActiveStreamState {
  const state = restoreStreamState(input);
  if (state.current) return state as ActiveStreamState;
  const review = state.reviews.find(
    (item) => item.dueAfter === 0 && eligible(state, sourceFor(state, item)),
  );
  if (review) {
    const { generatorId, seed, taskNumber, step } = review;
    return {
      ...state,
      current: {
        kind: 'review',
        reference: { generatorId, seed, taskNumber },
        step,
      },
    };
  }
  if (state.draws === Number.MAX_SAFE_INTEGER)
    throw new RangeError('Исчерпан счётчик случайных заданий.');
  const rng = new Rng(
    JSON.stringify([STREAM_VERSION, state.seed, state.draws]),
  );
  const taskNumber = rng.fork('number').weighted(
    streamDistribution(state.numbers, state.statistics).map((row) => ({
      value: row.taskNumber,
      weight: row.probability,
    })),
  );
  const source = rng
    .fork('source')
    .pick(
      state.sources.filter(
        (item) => item.taskNumber === taskNumber && eligible(state, item),
      ),
    );
  const seed =
    source.kind === 'curated'
      ? rng.fork('curated seed').pick(source.seeds)
      : JSON.stringify([STREAM_VERSION, hashSeed(state.seed), state.draws]);
  return {
    ...state,
    draws: state.draws + 1,
    current: {
      kind: 'random',
      reference: { generatorId: source.generatorId, seed, taskNumber },
    },
  };
}
/** Only evaluated answers update statistics; malformed input keeps the current task. */
export function recordStreamResult(
  input: StreamState,
  result: StreamOutcome,
): StreamState {
  const state = restoreStreamState(input);
  const outcome = outcomeSchema.parse(result);
  const current = state.current;
  if (!current) throw new TypeError('Сначала выбери задание потока.');
  if (outcome.kind === 'format-error') return state;
  if (state.completed === Number.MAX_SAFE_INTEGER)
    throw new RangeError('Исчерпан счётчик завершённых заданий.');
  const number = current.reference.taskNumber;
  const task = examConfig.tasks[number];
  if (
    (outcome.kind === 'automatic' && task.assessment !== 'short-answer') ||
    (outcome.kind === 'practice' && task.assessment !== 'criteria')
  )
    throw new TypeError('Способ оценки не соответствует номеру задания.');
  if (
    outcome.kind === 'practice' &&
    outcome.score !== null &&
    outcome.score > task.maxScore
  )
    throw new RangeError('Баллы превышают максимум задания.');
  const key = referenceKey(current.reference);
  let reviews = state.reviews
    .filter((item) => current.kind !== 'review' || referenceKey(item) !== key)
    .map((item) => ({ ...item, dueAfter: Math.max(0, item.dueAfter - 1) }));
  const evaluated =
    outcome.kind === 'automatic' ||
    (outcome.kind === 'practice' && outcome.score !== null);
  if (evaluated) {
    const row =
      state.statistics.find((item) => item.taskNumber === number) ??
      emptyTopicStatistics(number);
    if (outcome.kind === 'automatic') {
      row.automatic.attempts += 1;
      row.automatic.correct += Number(outcome.correct);
    } else {
      row[outcome.source].attempts += 1;
      row[outcome.source].credit += outcome.score / task.maxScore;
    }
    state.statistics = [
      ...state.statistics.filter((item) => item.taskNumber !== number),
      row,
    ];
    const fullCredit =
      outcome.kind === 'automatic'
        ? outcome.correct
        : outcome.score === task.maxScore;
    if (!fullCredit) {
      reviews = reviews.filter((item) => referenceKey(item) !== key);
      reviews.push({ ...current.reference, step: 3, dueAfter: 3 });
    } else if (current.kind === 'review' && current.step !== 30) {
      const step = current.step === 3 ? 10 : 30;
      reviews.push({ ...current.reference, step, dueAfter: step });
    }
  } else if (current.kind === 'review') {
    reviews.push({ ...current.reference, step: current.step, dueAfter: 3 });
  }
  return restoreStreamState({
    ...state,
    statistics: state.statistics,
    reviews,
    current: null,
    completed: state.completed + 1,
  });
}
