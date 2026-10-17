import {
  defaultStreamFilters,
  matchesStreamFilters,
  streamFiltersSchema,
  type StreamFilters,
} from '../core/stream/filtered';
import { resolveStreamTask, streamSources } from '../core/stream/catalog';
import { referenceSchema, type StreamReference } from '../core/stream/schemas';

const keys = [
  'numbers',
  'variant13',
  'topic',
  'difficulty',
  'review',
  'task',
  'seed',
];
export interface StreamQuery {
  filters: StreamFilters;
  reference: StreamReference | null;
}
/** Query data is untrusted; a partial or contradictory task link is never guessed. */
export function parseStreamQuery(
  search: string,
  topics: readonly string[],
): StreamQuery {
  if (search.length > 8192) throw new TypeError('Ссылка слишком длинная.');
  const params = new URLSearchParams(search);
  for (const key of keys)
    if (params.getAll(key).length > 1)
      throw new TypeError('Параметр ссылки повторяется.');
  const defaults = defaultStreamFilters();
  const numbers = params.get('numbers');
  if (
    numbers !== null &&
    !/^(?:[1-9]|1[0-6])(?:,(?:[1-9]|1[0-6]))*$/u.test(numbers)
  )
    throw new TypeError('Неверный список номеров.');
  const difficulty = params.get('difficulty');
  if (difficulty !== null && !/^[0-3]$/u.test(difficulty))
    throw new TypeError('Неверная сложность.');
  const review = params.get('review');
  if (review !== null && review !== '0' && review !== '1')
    throw new TypeError('Неверный режим повторения.');
  const filters = streamFiltersSchema.parse({
    numbers:
      numbers === null ? defaults.numbers : numbers.split(',').map(Number),
    variant13: params.get('variant13') ?? defaults.variant13,
    topic: params.get('topic') ?? '',
    difficulty: difficulty === null ? 0 : Number(difficulty),
    reviewOnly: review === '1',
  });
  if (filters.topic && !topics.includes(filters.topic))
    throw new TypeError('Неизвестная тема.');
  filters.numbers.sort((a, b) => a - b);
  const generatorId = params.get('task');
  const seed = params.get('seed');
  if ((generatorId === null) !== (seed === null))
    throw new TypeError('В ссылке нужны и задание, и seed.');
  if (generatorId === null || seed === null)
    return { filters, reference: null };
  const source = streamSources().find(
    (item) => item.generatorId === generatorId,
  );
  if (!source) throw new TypeError('Задание по ссылке не найдено.');
  const reference = referenceSchema.parse({
    generatorId,
    seed,
    taskNumber: source.taskNumber,
  });
  const task = resolveStreamTask(reference);
  if (numbers === null) filters.numbers = [task.taskNumber];
  if (!params.has('variant13') && task.variant13)
    filters.variant13 = task.variant13;
  if (!matchesStreamFilters(task, filters))
    throw new TypeError('Задание по ссылке не соответствует фильтрам.');
  return { filters, reference };
}
export function writeStreamQuery(query: StreamQuery): string {
  const filters = streamFiltersSchema.parse(query.filters);
  const params = new URLSearchParams({
    numbers: [...filters.numbers].sort((a, b) => a - b).join(','),
    variant13: filters.variant13,
    difficulty: String(filters.difficulty),
    review: filters.reviewOnly ? '1' : '0',
  });
  if (filters.topic) params.set('topic', filters.topic);
  if (query.reference) {
    const reference = referenceSchema.parse(query.reference);
    params.set('task', reference.generatorId);
    params.set('seed', reference.seed);
  }
  return `?${params.toString()}`;
}
/** Keep the configured Pages pathname and origin; links never depend on a root deployment. */
export function streamTaskUrl(location: string, query: StreamQuery): string {
  const url = new URL(location);
  url.search = writeStreamQuery(query);
  url.hash = '';
  return url.href;
}
