import { expect, test } from 'vitest';
import fc from 'fast-check';
import {
  parseStreamQuery,
  writeStreamQuery,
  streamTaskUrl,
} from '../../src/lib/stream-url';
import { defaultStreamFilters } from '../../src/core/stream/filtered';
import {
  streamSources,
  resolveStreamTask,
} from '../../src/core/stream/catalog';
import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import type { TaskNumber } from '../../src/core/types';
const topics = [
  ...new Set([
    ...generators.flatMap((generator) => generator.generate('topics').topics),
    ...bankTasks.flatMap((task) => task.topics),
  ]),
];
const defaults = defaultStreamFilters();
test('defaults, unknown non-app parameters and canonical multi-number query', () => {
  expect(parseStreamQuery('?utm_source=class', topics)).toEqual({
    filters: defaults,
    reference: null,
  });
  const query = parseStreamQuery(
    '?numbers=16,1,13&variant13=document&difficulty=3&review=1',
    topics,
  );
  expect(query.filters).toEqual({
    ...defaults,
    numbers: [1, 13, 16],
    variant13: 'document',
    difficulty: 3,
    reviewOnly: true,
  });
  expect(parseStreamQuery(writeStreamQuery(query), topics)).toEqual(query);
  expect(
    streamTaskUrl(
      'https://example.org/test-oge-app/stream/?old=value#fragment',
      query,
    ),
  ).toBe(`https://example.org/test-oge-app/stream/${writeStreamQuery(query)}`);
});
test('every generator and all curated seeds restore the exact task from a minimal link', () => {
  const references = streamSources().flatMap((source) =>
    (source.kind === 'curated' ? source.seeds : ['Пробел & + # ? 🧩']).map(
      (seed) => ({
        generatorId: source.generatorId,
        taskNumber: source.taskNumber,
        seed,
      }),
    ),
  );
  for (const reference of references) {
    const params = new URLSearchParams({
      task: reference.generatorId,
      seed: reference.seed,
    });
    const parsed = parseStreamQuery(`?${params}`, topics);
    expect(parsed.reference).toEqual(reference);
    expect(parsed.filters.numbers).toEqual([reference.taskNumber]);
    expect(resolveStreamTask(parsed.reference ?? reference)).toEqual(
      resolveStreamTask(reference),
    );
    expect(parseStreamQuery(writeStreamQuery(parsed), topics)).toEqual(parsed);
  }
});
test('arbitrary seed encoding round-trips with actual computed difficulty', () => {
  const source = generators.find((generator) => generator.taskNumber === 1);
  if (!source) throw new Error('Нет №1.');
  fc.assert(
    fc.property(fc.string({ maxLength: 200 }), (seed) => {
      const task = source.generate(seed);
      const query = {
        filters: {
          ...defaults,
          numbers: [1] as TaskNumber[],
          topic: task.topics[0] ?? '',
          difficulty: task.difficulty,
        },
        reference: { generatorId: source.id, taskNumber: 1 as const, seed },
      };
      expect(parseStreamQuery(writeStreamQuery(query), topics)).toEqual(query);
    }),
    { numRuns: 200 },
  );
});
for (const search of [
  '?task=unknown&seed=a',
  '?task=unknown',
  '?seed=a',
  '?numbers=',
  '?numbers=0',
  '?numbers=17',
  '?numbers=1,1',
  '?numbers=01',
  '?numbers=1e1',
  '?numbers=1,,2',
  '?difficulty=4',
  '?difficulty=2.0',
  '?difficulty=',
  '?review=yes',
  '?variant13=other',
  '?topic=unknown',
  '?numbers=1&numbers=2',
  '?task=x&task=x&seed=x',
  '?seed=x&seed=y&task=x',
  '?difficulty=1&difficulty=1',
  '?review=1&review=0',
  '?topic=x&topic=y',
  '?variant13=document&variant13=presentation',
  `?${'x'.repeat(8193)}`,
])
  test(`rejects malformed query ${search.slice(0, 65)}`, () => {
    expect(() => parseStreamQuery(search, topics)).toThrow();
  });
test('rejects invalid curated seeds, oversized seeds and task/filter contradictions', () => {
  const bank = bankTasks.find((task) => task.variant13 === 'document');
  const generated = generators[0]?.generate('link');
  if (!bank || !generated) throw new Error('Нет задания.');
  for (const query of [
    new URLSearchParams({ task: bank.generatorId, seed: 'missing' }),
    new URLSearchParams({ task: generated.generatorId, seed: 'x'.repeat(201) }),
    new URLSearchParams({
      task: bank.generatorId,
      seed: bank.seed,
      variant13: 'presentation',
    }),
    new URLSearchParams({
      task: generated.generatorId,
      seed: generated.seed,
      numbers: '16',
    }),
    new URLSearchParams({
      task: generated.generatorId,
      seed: generated.seed,
      difficulty: generated.difficulty === 1 ? '3' : '1',
    }),
    new URLSearchParams({
      task: generated.generatorId,
      seed: generated.seed,
      topic: 'Кодирование',
    }),
  ])
    expect(() => parseStreamQuery(`?${query}`, topics)).toThrow();
});
