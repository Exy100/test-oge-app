import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind =
  'search-union' | 'search-intersection' | 'search-difference' | 'search-three';
const titles: Record<Kind, string> = {
  'search-union': 'Число страниц для ИЛИ',
  'search-intersection': 'Число страниц для И',
  'search-difference': 'Страницы с одним словом без другого',
  'search-three': 'Объединение трёх поисковых множеств',
};
const questions: Record<Kind, string> = {
  'search-union': 'Сколько страниц найдёт запрос A ИЛИ B?',
  'search-intersection': 'Сколько страниц найдёт запрос A И B?',
  'search-difference':
    'Сколько страниц содержат слово A, но не содержат слово B?',
  'search-three': 'Сколько страниц найдёт запрос A ИЛИ B ИЛИ C?',
};
const semantics =
  'Поиск выполняется по одной неизменной базе страниц. Каждая страница учитывается один раз. A, B и C — множества страниц с соответствующими словами. И означает наличие всех указанных слов, ИЛИ — хотя бы одного. Все количества даны точно, в страницах.';

function search(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 8,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const words = rng
        .shuffle(['робот', 'алгоритм', 'программа', 'данные', 'сеть'])
        .slice(0, 3);
      // Disjoint Venn regions indexed by a nonempty membership bit mask.
      const regions = Array.from({ length: 8 }, (_, mask) =>
        mask === 0 ? 0 : rng.int(1, 20) * 10,
      );
      const count = (mask: number) =>
        regions.reduce(
          (sum, value, index) => sum + ((index & mask) === mask ? value : 0),
          0,
        );
      const a = count(1);
      const b = count(2);
      const c = count(4);
      const ab = count(3);
      const ac = count(5);
      const bc = count(6);
      const abc = count(7);
      const union = a + b - ab;
      let rows: [string, number][];
      const question = questions[kind];
      let result: number;
      let steps: string[];
      let mistakes: number[];
      if (kind === 'search-union') {
        rows = [
          ['A', a],
          ['B', b],
          ['A И B', ab],
        ];
        result = union;
        steps = [
          `Сумма отдельных результатов: ${String(a)} + ${String(b)} = ${String(a + b)}.`,
          `Страницы с обоими словами (${String(ab)}) вошли в эту сумму дважды. Вычти одно пересечение.`,
          `Итого: ${String(a)} + ${String(b)} − ${String(ab)} = ${String(result)} страниц.`,
        ];
        mistakes = [a + b, a + b - 2 * ab];
      } else if (kind === 'search-intersection') {
        rows = [
          ['A', a],
          ['B', b],
          ['A ИЛИ B', union],
        ];
        result = ab;
        steps = [
          `Сложи числа страниц для A и B: ${String(a + b)}.`,
          `Объединение (${String(union)}) содержит каждую страницу только один раз. Разность с суммой — повторно посчитанное пересечение.`,
          `Итого: ${String(a)} + ${String(b)} − ${String(union)} = ${String(result)} страниц.`,
        ];
        mistakes = [union, a + b];
      } else if (kind === 'search-difference') {
        rows = [
          ['A', a],
          ['A И B', ab],
        ];
        result = a - ab;
        steps = [
          `Во множестве A — ${String(a)} страниц.`,
          `Из них ${String(ab)} содержат также B и должны быть исключены.`,
          `Остаётся: ${String(a)} − ${String(ab)} = ${String(result)} страниц.`,
        ];
        mistakes = [a, ab];
        // If the two regions happen to have equal size, use the sum as the second misconception.
        if (mistakes[1] === result) mistakes[1] = a + ab;
      } else {
        rows = [
          ['A', a],
          ['B', b],
          ['C', c],
          ['A И B', ab],
          ['A И C', ac],
          ['B И C', bc],
          ['A И B И C', abc],
        ];
        result = regions.reduce((sum, value) => sum + value, 0);
        steps = [
          `Сумма отдельных множеств: ${String(a)} + ${String(b)} + ${String(c)} = ${String(a + b + c)}.`,
          `Вычти три попарных пересечения: ${String(ab)} + ${String(ac)} + ${String(bc)}. Страницы со всеми тремя словами при этом удалены полностью, поэтому прибавь ${String(abc)} обратно.`,
          `Итого: ${String(a)} + ${String(b)} + ${String(c)} − ${String(ab)} − ${String(ac)} − ${String(bc)} + ${String(abc)} = ${String(result)} страниц.`,
        ];
        mistakes = [result - abc, a + b + c];
      }
      const table = [
        '| Запрос | Страниц |',
        '| --- | --- |',
        ...rng
          .shuffle(rows)
          .map(([query, value]) => `| ${query} | ${String(value)} |`),
      ].join('\n');
      return taskFrom(kind, 8, seed, {
        statement: `${semantics}\n\nA — «${words[0] ?? ''}», B — «${words[1] ?? ''}»${kind === 'search-three' ? `, C — «${words[2] ?? ''}»` : ''}.\n\n${table}\n\n${question} Ответ запиши целым числом без единиц измерения.`,
        answer: { type: 'integer', value: String(result) },
        solution: steps.map((text) => ({ text })),
        hints: [
          'Представь страницы областями диаграммы множеств.',
          'Проверь, какие страницы учитываются несколько раз.',
          kind === 'search-three'
            ? 'После вычитания трёх попарных пересечений верни тройное пересечение один раз.'
            : 'И — пересечение, ИЛИ — объединение. Повторы в ответе не учитываются.',
        ],
        commonMistakes: mistakes.map((value, index) => ({
          answer: String(value),
          explanation:
            kind === 'search-difference'
              ? index === 0
                ? 'Не исключены страницы с обоими словами.'
                : 'Нужна область A вне B: из A вычитается пересечение.'
              : index === 0
                ? 'Неправильно учтено пересечение множеств. Проверь число включений каждой области.'
                : 'Операции с множествами подменены арифметикой без учёта повторов.',
        })),
      });
    },
    verify(task) {
      if (
        task.answer.type !== 'integer' ||
        !task.statement.startsWith(semantics) ||
        !task.statement.endsWith(
          questions[kind] + ' Ответ запиши целым числом без единиц измерения.',
        )
      )
        return false;
      const entries = [
        ...task.statement.matchAll(
          /^\| ([ABC](?: И(?:ЛИ)? [ABC])*) \| (\d+) \|$/gmu,
        ),
      ].map((row) => [row[1] ?? '', Number(row[2])] as const);
      const data = new Map(entries);
      const keys =
        kind === 'search-three'
          ? ['A', 'B', 'C', 'A И B', 'A И C', 'B И C', 'A И B И C']
          : kind === 'search-intersection'
            ? ['A', 'B', 'A ИЛИ B']
            : kind === 'search-difference'
              ? ['A', 'A И B']
              : ['A', 'B', 'A И B'];
      if (
        entries.length !== keys.length ||
        data.size !== keys.length ||
        keys.some((key) => !data.has(key)) ||
        entries.some(
          ([, value]) => !Number.isSafeInteger(value) || value > 100000,
        )
      )
        return false;
      const a = data.get('A') ?? 0;
      const b = data.get('B') ?? 0;
      let regions: number[];
      let expected: number;
      if (kind === 'search-three') {
        const c = data.get('C') ?? 0;
        const abc = data.get('A И B И C') ?? 0;
        const abOnly = (data.get('A И B') ?? 0) - abc;
        const acOnly = (data.get('A И C') ?? 0) - abc;
        const bcOnly = (data.get('B И C') ?? 0) - abc;
        regions = [
          a - abOnly - acOnly - abc,
          b - abOnly - bcOnly - abc,
          c - acOnly - bcOnly - abc,
          abOnly,
          acOnly,
          bcOnly,
          abc,
        ];
        expected = regions.reduce((sum, value) => sum + value, 0);
      } else {
        const overlap =
          kind === 'search-intersection'
            ? a - ((data.get('A ИЛИ B') ?? 0) - b)
            : (data.get('A И B') ?? 0);
        regions =
          kind === 'search-difference'
            ? [a - overlap, overlap]
            : [a - overlap, b - overlap, overlap];
        expected =
          kind === 'search-union'
            ? regions.reduce((sum, value) => sum + value, 0)
            : kind === 'search-intersection'
              ? overlap
              : a - overlap;
      }
      return (
        regions.every((value) => value >= 0) &&
        String(expected) === task.answer.value
      );
    },
  };
}
export const searchUnion = search('search-union');
export const searchIntersection = search('search-intersection');
export const searchDifference = search('search-difference');
export const searchThree = search('search-three');
