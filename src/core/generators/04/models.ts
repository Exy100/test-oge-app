import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';
import {
  readRoads,
  roadTable,
  routes,
  shortestDistance,
  towns,
  type Roads,
} from './roads.ts';

type Kind = 'route-length' | 'shortest-route' | 'route-via' | 'route-without';
const titles: Record<Kind, string> = {
  'route-length': 'Длина заданного маршрута по таблице',
  'shortest-route': 'Кратчайший путь по таблице дорог',
  'route-via': 'Кратчайший путь через обязательный пункт',
  'route-without': 'Кратчайший путь в обход закрытого пункта',
};

function model(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 4,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const roads: Roads = Array.from({ length: 6 }, () =>
        Array<number>(6).fill(0),
      );
      for (const [from, to, min, max] of [
        [0, 1, 2, 4],
        [1, 5, 2, 4],
        [0, 3, 5, 8],
        [3, 4, 5, 8],
        [4, 5, 5, 8],
        [1, 2, 6, 9],
        [2, 4, 6, 9],
      ] as const) {
        const weight = rng.int(min, max);
        const start = roads[from];
        const end = roads[to];
        if (start && end) {
          start[to] = weight;
          end[from] = weight;
        }
      }
      if (rng.chance(0.5)) {
        const weight = rng.int(4, 6);
        const start = roads[2];
        const end = roads[3];
        if (start && end) {
          start[3] = weight;
          end[2] = weight;
        }
      }
      // Rename intermediate towns so the best route cannot be memorised by label.
      const permutation = [0, ...rng.shuffle([1, 2, 3, 4]), 5];
      const renamed = roads.map((_, i) =>
        roads.map(
          (__, j) =>
            roads[permutation.indexOf(i)]?.[permutation.indexOf(j)] ?? 0,
        ),
      );
      const required = permutation[2] ?? 2;
      const closed = permutation[1] ?? 1;
      const via = towns[required] ?? 'В';
      const avoided = towns[closed] ?? 'Б';
      const candidates = routes(renamed).filter((route) =>
        kind === 'route-via'
          ? route.path.includes(required)
          : kind === 'route-without'
            ? !route.path.includes(closed)
            : kind === 'route-length'
              ? route.path.length >= 4
              : true,
      );
      candidates.sort((a, b) => a.distance - b.distance);
      const chosen =
        kind === 'route-length' ? rng.pick(candidates) : candidates[0];
      if (!chosen) throw new Error('Нет допустимого маршрута.');
      const path = chosen.path.map((index) => towns[index]).join(' → ');
      const weights = chosen.path
        .slice(1)
        .map((to, index) => renamed[chosen.path[index] ?? 0]?.[to] ?? 0);
      const taskQuestion =
        kind === 'route-length'
          ? `Найди длину маршрута ${path}.`
          : kind === 'route-via'
            ? `Найди длину кратчайшего пути из А в Е, обязательно проходящего через ${via}.`
            : kind === 'route-without'
              ? `Пункт ${avoided} закрыт: заходить в него и использовать примыкающие дороги нельзя. Найди длину кратчайшего пути из А в Е.`
              : 'Найди длину кратчайшего пути из А в Е.';
      return taskFrom(kind, 4, seed, {
        statement: `Таблица задаёт длины дорог в километрах. Каждая дорога двусторонняя; «—» означает отсутствие прямой дороги, а на диагонали — тот же пункт. Других дорог нет. Пункты в маршруте нельзя посещать повторно.\n\n${roadTable(renamed)}\n\n${taskQuestion} Ответ запиши целым числом километров.`,
        answer: { type: 'integer', value: String(chosen.distance) },
        solution: [
          {
            text:
              kind === 'route-length'
                ? `Прочитай ячейки для каждой соседней пары маршрута ${path}.`
                : kind === 'route-via'
                  ? `Отбери пути из А в Е, содержащие ${via}, без повторных посещений пунктов.`
                  : kind === 'route-without'
                    ? `Удали из рассмотрения строку и столбец ${avoided}, затем перебери оставшиеся пути из А в Е.`
                    : 'Перебери пути из А в Е по существующим дорогам, не повторяя пункты.',
          },
          {
            text:
              kind === 'route-length'
                ? `Длины участков: ${weights.map(String).join(', ')} км.`
                : `Допустимые пути и длины: ${candidates.map((route) => `${route.path.map((index) => towns[index]).join(' → ')}: ${String(route.distance)} км`).join('; ')}.`,
          },
          {
            text: `${kind === 'route-length' ? 'Сумма' : 'Минимум достигается на пути ' + path + ': '}${kind === 'route-length' ? ': ' : ''}${weights.map(String).join(' + ')} = ${String(chosen.distance)} км. Ответ: ${String(chosen.distance)}.`,
          },
        ],
        hints: [
          'Каждая ячейка — длина одной дороги, а не готового пути через другие пункты.',
          kind === 'route-length'
            ? 'Сложи длины дорог между соседними пунктами указанного маршрута.'
            : kind === 'route-via'
              ? `Обычный кратчайший путь может не проходить через ${via}; он тогда не подходит.`
              : kind === 'route-without'
                ? `Все дороги через ${avoided} исключены, даже если дают короткий путь.`
                : 'Сравни суммы длин разных допустимых путей.',
          'Считай километры, а не количество дорог. Двустороннюю дорогу при одном проходе учитывай один раз.',
        ],
        commonMistakes: [
          {
            answer: String(chosen.path.length - 1),
            explanation:
              'Это количество дорог в выбранном пути. Ответ должен быть суммой их длин в километрах.',
          },
          {
            answer: String(chosen.distance * 2),
            explanation:
              'Двусторонность дороги не удваивает её длину. Обратный путь не требуется.',
          },
        ],
      });
    },
    verify(task) {
      if (task.answer.type !== 'integer') return false;
      const roads = readRoads(task.statement);
      if (!roads) return false;
      let expected: number;
      if (kind === 'route-length') {
        const route =
          /Найди длину маршрута ([АБВГДЕ](?: → [АБВГДЕ])+?)\./u.exec(
            task.statement,
          )?.[1];
        if (!route) return false;
        const path = route
          .split(' → ')
          .map((town) => towns.findIndex((value) => value === town));
        if (
          path[0] !== 0 ||
          path.at(-1) !== 5 ||
          new Set(path).size !== path.length
        )
          return false;
        expected = 0;
        for (let index = 1; index < path.length; index += 1) {
          const weight = roads[path[index - 1] ?? -1]?.[path[index] ?? -1] ?? 0;
          if (!weight) return false;
          expected += weight;
        }
      } else {
        const via =
          /Найди длину кратчайшего пути из А в Е, обязательно проходящего через ([БВГД])\./u.exec(
            task.statement,
          )?.[1];
        const closed = /Пункт ([БВГД]) закрыт:/u.exec(task.statement)?.[1];
        if (
          kind === 'route-via'
            ? !via
            : !task.statement.includes('Найди длину кратчайшего пути из А в Е.')
        )
          return false;
        if (kind === 'route-without' && !closed) return false;
        expected = shortestDistance(
          roads,
          kind === 'route-via' ? towns.findIndex((town) => town === via) : -1,
          kind === 'route-without'
            ? towns.findIndex((town) => town === closed)
            : -1,
        );
      }
      return (
        Number.isFinite(expected) && String(expected) === task.answer.value
      );
    },
  };
}

export const routeLength = model('route-length');
export const shortestRoute = model('shortest-route');
export const routeVia = model('route-via');
export const routeWithout = model('route-without');
