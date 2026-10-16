import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import type { LogicPredicate, RoadProblem } from './short-problems.ts';
import { examGenerator, integerAnswer } from './short-tasks.ts';

const removedWord = examGenerator('removed-word', 'Удалённое слово', (seed) => {
  const rng = new Rng('removed-word:' + seed),
    words = rng
      .shuffle([
        'дуб',
        'клён',
        'сосна',
        'берёза',
        'крапива',
        'шиповник',
        'земляника',
        'хризантема',
        'лиственница',
        'можжевельник',
      ])
      .slice(0, rng.int(4, 10)),
    word = rng.pick(words),
    bits = rng.pick([8, 16]);
  return {
    problem: {
      kind: 'deleted-word',
      words,
      bits,
      bytes: ((word.length + 2) * bits) / 8,
    },
    answer: { type: 'word', value: word, caseSensitive: false },
  };
});
function logic(mode: 'count-true' | 'min-false'): Generator {
  return examGenerator(
    `logic-${mode}`,
    mode === 'count-true'
      ? 'Количество натуральных решений'
      : 'Минимум при ложном выражении',
    (seed) => {
      const rng = new Rng(`logic-${mode}:${seed}`),
        form = rng.int(0, 2),
        low = rng.int(2, 25),
        high = low + rng.int(4, 25);
      let predicate: LogicPredicate, answer: number;
      if (mode === 'count-true') {
        if (form === 0) {
          predicate = ['not', ['gt', high]];
          answer = high;
        } else if (form === 1) {
          predicate = ['and', ['gt', low], ['not', ['ge', high]]];
          answer = high - low - 1;
        } else {
          predicate = [
            'and',
            ['gt', low],
            ['not', ['or', ['ge', high], ['not', ['odd']]]],
          ];
          // Number of odd positive integers below high, minus those not above low.
          answer = Math.floor(high / 2) - Math.ceil(low / 2);
        }
      } else {
        predicate =
          form === 0
            ? ['not', ['ge', low]]
            : form === 1
              ? ['or', ['not', ['ge', low]], ['ge', high]]
              : [
                  'or',
                  ['not', ['ge', low]],
                  ['and', ['ge', high], ['not', ['odd']]],
                ];
        answer = low;
      }
      return {
        problem: { kind: 'logic', predicate, mode },
        answer: integerAnswer(answer),
      };
    },
  );
}
const shortestRoad = examGenerator(
  'shortest-road',
  'Кратчайший путь по таблице',
  (seed) => {
    const rng = new Rng('shortest-road:' + seed),
      size = rng.int(5, 6),
      density = rng.pick([0.1, 0.4, 0.8]),
      names = Array.from({ length: size }, (_, i) =>
        String.fromCharCode(65 + i),
      ),
      edges: [string, string, number][] = [];
    for (let from = 0; from < size - 1; from++)
      for (let to = from + 1; to < size; to++)
        if (to === from + 1 || rng.chance(density))
          edges.push([names[from] ?? '', names[to] ?? '', rng.int(1, 9)]);
    const end = names[size - 1] ?? '',
      lengths: number[] = [];
    // Construction exhaustively traverses simple routes; verify uses Dijkstra.
    function visit(
      at: string,
      seen: ReadonlySet<string>,
      distance: number,
    ): void {
      if (at === end) {
        lengths.push(distance);
        return;
      }
      for (const [a, b, weight] of edges) {
        const next = at === a ? b : at === b ? a : undefined;
        if (next !== undefined && !seen.has(next))
          visit(next, new Set([...seen, next]), distance + weight);
      }
    }
    visit('A', new Set(['A']), 0);
    const problem: RoadProblem = { kind: 'roads', edges, end };
    return { problem, answer: integerAnswer(Math.min(...lengths)) };
  },
);
export const elementaryShortGenerators: readonly Generator[] = [
  removedWord,
  logic('count-true'),
  logic('min-false'),
  shortestRoad,
];
