import { describe, expect, it } from 'vitest';
import {
  booleanValue,
  compareBoolean,
  parseBoolean,
} from '../../src/lib/interactives/logic';
import {
  acceptsShortest,
  directedCounts,
  directedMaps,
  roadLength,
  roadMaps,
  shortestRoad,
  type DirectedEdge,
  type RoadEdge,
} from '../../src/lib/interactives/graphs';
import { shortFixtures } from '../fixtures/exam/short-answers';

/** Independent truth-vector oracle; all 16 Boolean functions have a canonical DNF. */
function formula(mask: number) {
  if (mask === 0) return 'A И НЕ A';
  return Array.from({ length: 4 }, (_, index) => index)
    .filter((index) => mask & (2 ** index))
    .map(
      (index) => `(${index & 2 ? 'A' : 'НЕ A'} И ${index & 1 ? 'B' : 'НЕ B'})`,
    )
    .join(' ИЛИ ');
}

function subsets(values: readonly string[]): string[][] {
  return [
    [],
    ...values.flatMap((value) =>
      subsets(values.filter((item) => item !== value)).map((tail) => [
        value,
        ...tail,
      ]),
    ),
  ];
}
function routeOracle(
  nodes: readonly string[],
  edges: readonly RoadEdge[],
  start: string,
  end: string,
) {
  const paths = subsets(
    nodes.filter((node) => node !== start && node !== end),
  ).map((middle) => [start, ...middle, end]);
  const routes: { path: string[]; distance: number }[] = [];
  for (const path of paths) {
    const weights = path
      .slice(1)
      .map(
        (node, index) =>
          edges.find(
            ([a, b]) =>
              (a === node && b === path[index]) ||
              (b === node && a === path[index]),
          )?.[2],
      );
    if (weights.every((weight) => weight !== undefined))
      routes.push({
        path,
        distance: weights.reduce((sum, weight) => sum + weight, 0),
      });
  }
  return routes;
}
function pathOracle(
  nodes: readonly string[],
  edges: readonly DirectedEdge[],
  start: string,
  end: string,
) {
  return subsets(nodes.filter((node) => node !== start && node !== end))
    .map((middle) => [start, ...middle, end])
    .filter((path) =>
      path
        .slice(1)
        .every((node, index) =>
          edges.some(([from, to]) => from === path[index] && to === node),
        ),
    ).length;
}

describe('logic constructor', () => {
  it('evaluates every possible Boolean function against bit vectors, not another recursive evaluator', () => {
    for (let mask = 0; mask < 16; mask++) {
      const node = parseBoolean(formula(mask));
      for (let index = 0; index < 4; index++)
        expect(booleanValue(node, Boolean(index & 2), Boolean(index & 1))).toBe(
          Boolean(mask & (2 ** index)),
        );
      for (const [target, expected] of [
        ['A И B', 8],
        ['НЕ (A ИЛИ B)', 1],
        ['A И НЕ B', 4],
      ] as const)
        expect(compareBoolean(formula(mask), target).equivalent).toBe(
          mask === expected,
        );
    }
  });
  it('accepts equivalent syntax and rejects a match on just one selected input', () => {
    for (const source of ['B И A', 'НЕ (НЕ A ИЛИ НЕ B)', 'A И A И B', 'А И В'])
      expect(compareBoolean(source, 'A И B').equivalent).toBe(true);
    expect(compareBoolean('A', 'A И B')).toMatchObject({ equivalent: false });
    expect(
      compareBoolean('A', 'A И B').rows.find((row) => row.a && !row.b),
    ).toMatchObject({ actual: true, expected: false });
    expect(compareBoolean('A ИЛИ B И A', 'A').equivalent).toBe(true);
    expect(compareBoolean('НЕ A И B', 'НЕ (A И B)').equivalent).toBe(false);
    expect(compareBoolean('НЕ НЕ A', 'A').equivalent).toBe(true);
  });
  it('preserves nested transformations over many compositions using independent bit operations', () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        const left = formula(a),
          right = formula(b);
        // Keep compositions inside the actual editor limit.
        for (const [source, expected] of [
          [`НЕ ((${left}) И (${right}))`, 15 ^ (a & b)],
          [`(${left}) ИЛИ (${right})`, a | b],
        ] as const) {
          if (source.length > 160) continue;
          const node = parseBoolean(source);
          const mask = [false, true]
            .flatMap((av) =>
              [false, true].map((bv) => booleanValue(node, av, bv)),
            )
            .reduce((sum, value, index) => sum + (value ? 2 ** index : 0), 0);
          expect(mask).toBe(expected);
        }
      }
  });
  it.each([
    '',
    'A B',
    'A И',
    'ИЛИ A',
    'A)',
    '(A',
    '()',
    'X > 3',
    'A && B',
    'alert(1)',
    'НЕ '.repeat(26) + 'A',
    'A'.repeat(161),
  ])('rejects invalid or unbounded expression %s', (source) => {
    expect(() => parseBoolean(source)).toThrow();
  });
});

describe('weighted roads', () => {
  it('matches all simple-route permutations on all 64 four-vertex road topologies', () => {
    const nodes = ['A', 'B', 'C', 'D'],
      pairs: RoadEdge[] = [
        ['A', 'B', 1],
        ['A', 'C', 2],
        ['A', 'D', 3],
        ['B', 'C', 1],
        ['B', 'D', 2],
        ['C', 'D', 1],
      ];
    for (let mask = 0; mask < 64; mask++) {
      const edges = pairs.filter((_, index) => mask & (2 ** index)),
        routes = routeOracle(nodes, edges, 'A', 'D');
      const expected = routes.length
        ? Math.min(...routes.map((route) => route.distance))
        : null;
      const actual = shortestRoad(nodes, edges, 'A', 'D');
      expect(actual.distance).toBe(expected);
      for (const route of routes)
        expect(acceptsShortest(nodes, edges, 'A', 'D', route.path)).toBe(
          route.distance === expected,
        );
      if (expected !== null)
        expect(routes).toContainEqual({
          path: actual.path,
          distance: expected,
        });
    }
  });
  it('accepts both minimal routes, rejects greedy, incomplete and repeated-vertex routes', () => {
    const g = roadMaps.equal;
    expect(
      acceptsShortest(g.nodes, g.edges, 'А', 'Е', ['А', 'Б', 'Г', 'Е']),
    ).toBe(true);
    expect(
      acceptsShortest(g.nodes, g.edges, 'А', 'Е', ['А', 'В', 'Д', 'Е']),
    ).toBe(true);
    for (const path of [
      ['А', 'Е'],
      ['А', 'Б'],
      ['А', 'Б', 'А', 'В', 'Д', 'Е'],
      ['А', 'Ж', 'Е'],
    ])
      expect(acceptsShortest(g.nodes, g.edges, 'А', 'Е', path)).toBe(false);
    expect(roadLength(g.edges, ['А', 'Б', 'А'])).toBeNull();
    const d = roadMaps.detour;
    expect(shortestRoad(d.nodes, d.edges, 'А', 'Е').distance).toBe(6);
    expect(roadLength(d.edges, ['А', 'Б', 'Г', 'Е'])).toBe(12);
  });
  it('reproduces official №4 distances using the scene model', () => {
    for (const fixture of shortFixtures.filter((f) => f.taskNumber === 4)) {
      const p = fixture.parameters;
      if (p.kind !== 'roads') throw new Error('Не та фикстура.');
      const nodes = Array.from(new Set(p.edges.flatMap(([a, b]) => [a, b])));
      expect(String(shortestRoad(nodes, p.edges, 'A', p.end).distance)).toBe(
        fixture.answers[0],
      );
      expect(
        Math.min(
          ...routeOracle(nodes, p.edges, 'A', p.end).map(
            (route) => route.distance,
          ),
        ),
      ).toBe(Number(fixture.answers[0]));
    }
  });
  it('rejects malformed roads rather than silently changing the graph', () => {
    for (const edges of [
      [['A', 'B', 0]],
      [['A', 'A', 1]],
      [['A', 'Z', 1]],
      [
        ['A', 'B', 1],
        ['B', 'A', 2],
      ],
    ] as const)
      expect(() => shortestRoad(['A', 'B'], edges, 'A', 'B')).toThrow();
    expect(shortestRoad(['A', 'B'], [], 'A', 'B')).toEqual({
      distance: null,
      path: [],
    });
  });
});

describe('directed path counts', () => {
  it('matches permutation enumeration on all 64 four-vertex DAGs and ignores label order', () => {
    const nodes = ['D', 'B', 'A', 'C'],
      pairs: DirectedEdge[] = [
        ['A', 'B'],
        ['A', 'C'],
        ['A', 'D'],
        ['B', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ];
    for (let mask = 0; mask < 64; mask++) {
      const edges = pairs.filter((_, index) => mask & (2 ** index)),
        result = directedCounts(nodes, edges, 'A', 'D');
      expect(result.total).toBe(pathOracle(nodes, edges, 'A', 'D'));
      for (const [from, to] of edges)
        expect(result.order.indexOf(from)).toBeLessThan(
          result.order.indexOf(to),
        );
    }
  });
  it('counts each teaching scheme and zero paths when its finish is isolated', () => {
    for (const graph of Object.values(directedMaps)) {
      const start = graph.nodes[0] ?? '',
        end = graph.nodes.at(-1) ?? '';
      expect(directedCounts(graph.nodes, graph.edges, start, end).total).toBe(
        pathOracle(graph.nodes, graph.edges, start, end),
      );
      expect(
        directedCounts(
          graph.nodes,
          graph.edges.filter(([, to]) => to !== end),
          start,
          end,
        ).total,
      ).toBe(0);
    }
  });
  it('reproduces all official №9 counts independently and with the scene model', () => {
    for (const fixture of shortFixtures.filter((f) => f.taskNumber === 9)) {
      const p = fixture.parameters;
      if (p.kind !== 'paths') throw new Error('Не та фикстура.');
      const nodes = Array.from(new Set(p.edges.flat()));
      expect(directedCounts(nodes, p.edges, 'A', p.end).total).toBe(
        Number(fixture.answers[0]),
      );
      expect(pathOracle(nodes, p.edges, 'A', p.end)).toBe(
        Number(fixture.answers[0]),
      );
    }
  });
  it('rejects cycles, self loops and duplicate arrows', () => {
    for (const edges of [
      [
        ['A', 'B'],
        ['B', 'A'],
      ],
      [['A', 'A']],
      [
        ['A', 'B'],
        ['A', 'B'],
      ],
      [['A', 'Z']],
    ] as const)
      expect(() => directedCounts(['A', 'B'], edges, 'A', 'B')).toThrow();
  });
});
