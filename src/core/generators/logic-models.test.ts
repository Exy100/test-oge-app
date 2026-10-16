import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import type { TaskInstance } from '../types';
import { learningGeneratorsForTask as generatorsForTask } from './learning';
import {
  readRoads,
  roadTable,
  shortestDistance,
  routes,
  type Roads,
} from './04/roads';
import {
  logicAnd,
  logicNotOr,
  logicDivisibility,
  logicExclusive,
} from './03/logic';
import {
  routeLength,
  shortestRoute,
  routeVia,
  routeWithout,
} from './04/models';

const added = [...generatorsForTask(3), ...generatorsForTask(4)];
const labels = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

test('road variants vary topology and the intermediate town on the shortest route', () => {
  const middle = new Set<string>();
  const edgeCounts = new Set<number>();
  for (let seed = 0; seed < 64; seed += 1) {
    const task = shortestRoute.generate(String(seed));
    middle.add(
      /А → ([БВГД]) → Е/u.exec(task.solution.at(-1)?.text ?? '')?.[1] ?? '',
    );
    edgeCounts.add(
      matrix(task)
        .flat()
        .filter((weight) => weight > 0).length / 2,
    );
  }
  expect(middle).toEqual(new Set(['Б', 'В', 'Г', 'Д']));
  expect(edgeCounts.size).toBeGreaterThan(1);
});

function logicOracle(task: TaskInstance): number {
  const [, limit = -1, a = -1, b = -1] =
    task.statement.match(/\d+/gu)?.map(Number) ?? [];
  expect(limit).toBeGreaterThan(0);
  expect(limit).toBeLessThanOrEqual(200);
  const matches: number[] = [];
  for (let x = 0; x <= limit; x += 1) {
    let accepted: boolean;
    switch (task.subtype) {
      case 'logic-and':
        accepted = x > a && x <= b;
        break;
      case 'logic-not-or':
        accepted = !(x < a || x > b);
        break;
      case 'logic-divisibility':
        accepted = x % a === 0 && !(x % b === 0);
        break;
      case 'logic-exclusive':
        accepted = Number(x % a === 0) + Number(x % b === 0) === 1;
        break;
      default:
        throw new Error('Неизвестный подтип.');
    }
    if (accepted) matches.push(x);
  }
  expect(matches.length).toBeGreaterThan(0);
  if (task.subtype === 'logic-and') return Math.min(...matches);
  if (task.subtype === 'logic-not-or') return Math.max(...matches);
  return matches.length;
}

function matrix(task: TaskInstance): Roads {
  const rows = task.statement
    .split('\n')
    .filter((row) => /^\| [АБВГДЕ] \|/u.test(row));
  expect(rows).toHaveLength(6);
  return rows.map((row, index) => {
    const cells = row.split('|').map((cell) => cell.trim());
    expect(cells[1]).toBe(labels[index]);
    expect(cells).toHaveLength(9);
    return cells.slice(2, 8).map((cell) => (cell === '—' ? 0 : Number(cell)));
  });
}

// Enumerate ordered subsets of the four intermediate towns, irrespective of edges.
const intermediates: number[][] = [];
function orderedSubsets(prefix: number[], remaining: number[]): void {
  intermediates.push(prefix);
  for (const next of remaining)
    orderedSubsets(
      [...prefix, next],
      remaining.filter((value) => value !== next),
    );
}
orderedSubsets([], [1, 2, 3, 4]);

function lengthOf(path: number[], roads: Roads): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const distance = roads[path[index - 1] ?? -1]?.[path[index] ?? -1] ?? 0;
    if (distance === 0) return Infinity;
    total += distance;
  }
  return total;
}

function modelOracle(task: TaskInstance): number {
  const roads = matrix(task);
  for (let i = 0; i < 6; i += 1)
    for (let j = 0; j < 6; j += 1) {
      expect(roads[i]?.[j]).toBe(roads[j]?.[i]);
      expect(Number.isInteger(roads[i]?.[j])).toBe(true);
      expect(roads[i]?.[j]).toBeGreaterThanOrEqual(0);
    }
  if (task.subtype === 'route-length') {
    const sequence =
      /Найди длину маршрута ([^.]+)\./u.exec(task.statement)?.[1] ?? '';
    const path = sequence.split(' → ').map((label) => labels.indexOf(label));
    expect(new Set(path).size).toBe(path.length);
    return lengthOf(path, roads);
  }
  const all = intermediates.map((middle) => ({
    middle,
    distance: lengthOf([0, ...middle, 5], roads),
  }));
  const allowed = all.filter(({ middle }) =>
    task.subtype === 'route-via'
      ? middle.includes(
          labels.indexOf(/через ([БВГД])\./u.exec(task.statement)?.[1] ?? ''),
        )
      : task.subtype === 'route-without'
        ? !middle.includes(
            labels.indexOf(
              /Пункт ([БВГД]) закрыт/u.exec(task.statement)?.[1] ?? '',
            ),
          )
        : true,
  );
  const answer = Math.min(...allowed.map((route) => route.distance));
  if (task.subtype === 'route-via' || task.subtype === 'route-without')
    expect(answer).toBeGreaterThan(
      Math.min(...all.map((route) => route.distance)),
    );
  return answer;
}

for (const generator of added) {
  testGenerator(generator, {
    assertUnique(task) {
      expect(task.answer).toEqual({
        type: 'integer',
        value: String(
          task.taskNumber === 3 ? logicOracle(task) : modelOracle(task),
        ),
      });
    },
    assertQuality(task) {
      if (task.answer.type !== 'integer') throw new Error('Нужен целый ответ.');
      expect(Number(task.answer.value)).toBeGreaterThan(0);
      expect(Number(task.answer.value)).toBeLessThanOrEqual(200);
      expect(task.solution.at(-1)?.text).toContain(task.answer.value);
      expect(
        new Set(task.commonMistakes.map((mistake) => mistake.answer)).size,
      ).toBeGreaterThanOrEqual(2);
      for (const mistake of task.commonMistakes)
        expect(
          generator.verify({
            ...task,
            answer: { type: 'integer', value: mistake.answer },
          }),
        ).toBe(false);
      if (task.taskNumber === 4) expect(task.statement).toContain('километрах');
    },
  });
  test(`${generator.id} rejects wrong answers and missing parameters`, () => {
    const task = generator.generate('negative');
    expect(generator.verify({ ...task, statement: 'Нет условия.' })).toBe(
      false,
    );
    expect(
      generator.verify({
        ...task,
        answer: { type: 'word', value: 'А', caseSensitive: false },
      }),
    ).toBe(false);
    expect(
      generator.verify({ ...task, answer: { type: 'integer', value: '-1' } }),
    ).toBe(false);
  });
}

test('logic boundaries, zero and common divisors agree with hand-checkable sets', () => {
  const fixtures = [
    [logicAnd, 12, '(X > 5) И (X <= 9)', 6],
    [logicNotOr, 12, 'НЕ ((X < 5) ИЛИ (X > 9))', 9],
    [logicDivisibility, 12, '(X кратно 2) И НЕ (X кратно 3)', 4],
    [logicExclusive, 12, '(X кратно 2) ИСКЛЮЧАЮЩЕЕ ИЛИ (X кратно 3)', 6],
    [logicExclusive, 12, '(X кратно 2) ИСКЛЮЧАЮЩЕЕ ИЛИ (X кратно 4)', 3],
  ] as const;
  for (const [generator, limit, expression, answer] of fixtures) {
    const task = {
      ...generator.generate('fixture'),
      statement: `Рассматриваются целые X от 0 до ${String(limit)} включительно. Выражение: \`${expression}\`.`,
      answer: { type: 'integer' as const, value: String(answer) },
    };
    expect(generator.verify(task)).toBe(true);
    expect(
      generator.verify({
        ...task,
        answer: { type: 'integer', value: String(answer + 1) },
      }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        statement: task.statement.replace('до 12', 'до 201'),
      }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        statement: task.statement.replace('Выражение:', 'Другое:'),
      }),
    ).toBe(false);
  }
  const task = logicAnd.generate('fixture');
  expect(
    logicAnd.verify({
      ...task,
      statement:
        'Рассматриваются целые X от 0 до 10 включительно. Выражение: `(X > 9) И (X <= 3)`.',
    }),
  ).toBe(false);
  for (const expression of [
    '(X кратно 0) И НЕ (X кратно 2)',
    '(X кратно 2) И НЕ (X кратно 2)',
    '(X кратно 4) И НЕ (X кратно 2)',
  ])
    expect(
      logicDivisibility.verify({
        ...task,
        statement: `Рассматриваются целые X от 0 до 12 включительно. Выражение: \`${expression}\`.`,
      }),
    ).toBe(false);
});

test('road validation rejects asymmetry, bad weights, diagonals and duplicate labels', () => {
  const statement = shortestRoute.generate('fixture').statement;
  const roads = readRoads(statement);
  expect(roads).not.toBeNull();
  if (!roads) throw new Error('Нет таблицы.');
  for (const [i, j, value] of [
    [0, 1, 50],
    [0, 0, 2],
    [1, 2, 51],
    [2, 1, -3],
    [3, 4, 1.5],
  ] as const) {
    const changed = roads.map((row) => [...row]);
    const row = changed[i];
    if (row) row[j] = value;
    expect(readRoads(roadTable(changed))).toBeNull();
  }
  expect(readRoads(statement.replace('| А |', '| Б |'))).toBeNull();
  expect(readRoads(statement.replace('| Пункт |', '| Город |'))).toBeNull();
  expect(
    readRoads(
      statement
        .split('\n')
        .filter((row) => !row.startsWith('| Е |'))
        .join('\n'),
    ),
  ).toBeNull();
  expect(readRoads(statement.replace('| А |', '| А | — |'))).toBeNull();
});

test('shortest path constraints, disconnected graphs and ties', () => {
  const roads: Roads = Array.from({ length: 6 }, () =>
    Array<number>(6).fill(0),
  );
  for (const [a, b, weight] of [
    [0, 1, 2],
    [1, 5, 2],
    [0, 3, 3],
    [3, 5, 1],
    [1, 2, 5],
    [2, 5, 6],
  ] as const) {
    const from = roads[a];
    const to = roads[b];
    if (from && to) {
      from[b] = weight;
      to[a] = weight;
    }
  }
  expect(shortestDistance(roads)).toBe(4);
  expect(routes(roads).filter((route) => route.distance === 4)).toHaveLength(2);
  expect(shortestDistance(roads, 2)).toBe(13);
  expect(shortestDistance(roads, -1, 1)).toBe(4);
  expect(shortestDistance(roads, 4)).toBe(Infinity);
  const empty: Roads = Array.from({ length: 6 }, () =>
    Array<number>(6).fill(0),
  );
  expect(shortestDistance(empty)).toBe(Infinity);
  expect(routes(empty)).toEqual([]);
  for (const generator of [shortestRoute, routeVia, routeWithout]) {
    const task = generator.generate('fixture');
    const broken = task.statement.replace(
      /\| Пункт[^]*?\n\n/u,
      roadTable(empty) + '\n\n',
    );
    expect(generator.verify({ ...task, statement: broken })).toBe(false);
    expect(
      generator.verify({
        ...task,
        statement: task.statement.replace(
          'Найди длину кратчайшего',
          'Найди число',
        ),
      }),
    ).toBe(false);
  }
  const task = routeWithout.generate('fixture');
  expect(
    routeWithout.verify({
      ...task,
      statement: task.statement.replace(
        /Пункт ([БВГД]) закрыт:/u,
        'Пункт $1 открыт:',
      ),
    }),
  ).toBe(false);
});

test('given routes must use real edges and never repeat a town', () => {
  const task = routeLength.generate('fixture');
  for (const path of ['А → Е', 'А → Б → А → Б → Е', 'Е → Б → А']) {
    expect(
      routeLength.verify({
        ...task,
        statement: task.statement.replace(
          /Найди длину маршрута [^.]+\./u,
          `Найди длину маршрута ${path}.`,
        ),
      }),
    ).toBe(false);
  }
  expect(
    routeLength.verify({
      ...task,
      statement: task.statement.replace('Найди длину маршрута', 'Маршрут'),
    }),
  ).toBe(false);
});
