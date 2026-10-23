export type RoadEdge = readonly [from: string, to: string, weight: number];
export type DirectedEdge = readonly [from: string, to: string];
export interface Position {
  x: number;
  y: number;
}
export interface RoadMap {
  nodes: readonly string[];
  edges: readonly RoadEdge[];
  positions: readonly Position[];
}
export interface DirectedMap {
  nodes: readonly string[];
  edges: readonly DirectedEdge[];
  positions: readonly Position[];
}

function validateNodes(nodes: readonly string[], start: string, end: string) {
  if (
    nodes.length < 2 ||
    nodes.length > 8 ||
    new Set(nodes).size !== nodes.length ||
    nodes.some((node) => !/^[A-ZА-ЯЁ]$/u.test(node)) ||
    !nodes.includes(start) ||
    !nodes.includes(end) ||
    start === end
  )
    throw new RangeError(
      'Нужны 2–8 разных вершин, различные начало и конец из этого графа.',
    );
}

export function shortestRoad(
  nodes: readonly string[],
  edges: readonly RoadEdge[],
  start: string,
  end: string,
) {
  validateNodes(nodes, start, end);
  const keys = new Set<string>();
  for (const [a, b, weight] of edges) {
    const key = [a, b].sort().join(':');
    if (
      !nodes.includes(a) ||
      !nodes.includes(b) ||
      a === b ||
      !Number.isInteger(weight) ||
      weight < 1 ||
      weight > 99 ||
      keys.has(key)
    )
      throw new RangeError(
        'Дороги должны быть разными, двусторонними и иметь целую длину 1–99.',
      );
    keys.add(key);
  }
  const distances = new Map(
    nodes.map((node) => [node, node === start ? 0 : Infinity]),
  );
  const previous = new Map<string, string>();
  const remaining = new Set(nodes);
  while (remaining.size) {
    const current = Array.from(remaining).sort(
      (a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity),
    )[0];
    if (current === undefined || !Number.isFinite(distances.get(current)))
      break;
    remaining.delete(current);
    for (const [a, b, weight] of edges) {
      const next = a === current ? b : b === current ? a : undefined;
      if (next !== undefined && remaining.has(next)) {
        const distance = (distances.get(current) ?? Infinity) + weight;
        if (distance < (distances.get(next) ?? Infinity)) {
          distances.set(next, distance);
          previous.set(next, current);
        }
      }
    }
  }
  const distance = distances.get(end) ?? Infinity;
  if (!Number.isFinite(distance))
    return { distance: null, path: [] as string[] };
  const path = [end];
  while (path[0] !== start) {
    const parent = previous.get(path[0] ?? '');
    if (!parent) throw new Error('Нарушено восстановление пути.');
    path.unshift(parent);
  }
  return { distance, path };
}

export function roadLength(
  edges: readonly RoadEdge[],
  path: readonly string[],
): number | null {
  if (path.length === 0 || new Set(path).size !== path.length) return null;
  let length = 0;
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1],
      b = path[index];
    const edge = edges.find(
      ([from, to]) => (from === a && to === b) || (from === b && to === a),
    );
    if (!edge) return null;
    length += edge[2];
  }
  return length;
}

export function acceptsShortest(
  nodes: readonly string[],
  edges: readonly RoadEdge[],
  start: string,
  end: string,
  path: readonly string[],
) {
  const best = shortestRoad(nodes, edges, start, end).distance;
  return (
    best !== null &&
    path[0] === start &&
    path.at(-1) === end &&
    path.every((node) => nodes.includes(node)) &&
    roadLength(edges, path) === best
  );
}

export function directedCounts(
  nodes: readonly string[],
  edges: readonly DirectedEdge[],
  start: string,
  end: string,
) {
  validateNodes(nodes, start, end);
  const seen = new Set<string>();
  const incoming = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const [from, to] of edges) {
    const key = from + ':' + to;
    if (
      !nodes.includes(from) ||
      !nodes.includes(to) ||
      from === to ||
      seen.has(key)
    )
      throw new RangeError(
        'Стрелки должны соединять разные вершины графа и не повторяться.',
      );
    seen.add(key);
    incoming.get(to)?.push(from);
  }
  const pending = new Set(nodes),
    order: string[] = [];
  while (pending.size) {
    const ready = Array.from(pending).find((node) =>
      incoming.get(node)?.every((parent) => !pending.has(parent)),
    );
    if (ready === undefined)
      throw new RangeError(
        'В схеме есть цикл: правило сложения применяется к графу без циклов.',
      );
    pending.delete(ready);
    order.push(ready);
  }
  const counts = new Map<string, number>();
  for (const node of order)
    counts.set(
      node,
      node === start
        ? 1
        : (incoming.get(node) ?? []).reduce(
            (sum, parent) => sum + (counts.get(parent) ?? 0),
            0,
          ),
    );
  return { order, incoming, counts, total: counts.get(end) ?? 0 };
}

const roadPositions = [
  { x: 30, y: 130 },
  { x: 135, y: 65 },
  { x: 135, y: 195 },
  { x: 260, y: 65 },
  { x: 260, y: 195 },
  { x: 380, y: 130 },
];
export const roadMaps: Readonly<Record<'equal' | 'detour', RoadMap>> = {
  equal: {
    nodes: ['А', 'Б', 'В', 'Г', 'Д', 'Е'],
    positions: roadPositions,
    edges: [
      ['А', 'Б', 2],
      ['А', 'В', 2],
      ['Б', 'Г', 3],
      ['В', 'Д', 3],
      ['Г', 'Е', 2],
      ['Д', 'Е', 2],
      ['Б', 'В', 4],
      ['Г', 'Д', 4],
      ['А', 'Е', 12],
    ],
  },
  detour: {
    nodes: ['А', 'Б', 'В', 'Г', 'Д', 'Е'],
    positions: roadPositions,
    edges: [
      ['А', 'Б', 1],
      ['А', 'В', 4],
      ['Б', 'Г', 9],
      ['В', 'Д', 1],
      ['Г', 'Е', 2],
      ['Д', 'Е', 1],
      ['Б', 'В', 8],
      ['Г', 'Д', 5],
      ['А', 'Е', 15],
    ],
  },
};
export const directedMaps: Readonly<Record<'fork' | 'merge', DirectedMap>> = {
  fork: {
    nodes: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'],
    positions: [
      { x: 25, y: 115 },
      { x: 120, y: 40 },
      { x: 120, y: 190 },
      { x: 220, y: 40 },
      { x: 220, y: 190 },
      { x: 310, y: 115 },
      { x: 395, y: 115 },
    ],
    edges: [
      ['А', 'Б'],
      ['А', 'В'],
      ['Б', 'Г'],
      ['Б', 'Д'],
      ['В', 'Г'],
      ['В', 'Д'],
      ['Г', 'Е'],
      ['Д', 'Е'],
      ['Е', 'Ж'],
    ],
  },
  merge: {
    nodes: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'],
    positions: [
      { x: 25, y: 115 },
      { x: 110, y: 40 },
      { x: 110, y: 190 },
      { x: 210, y: 40 },
      { x: 210, y: 190 },
      { x: 305, y: 40 },
      { x: 305, y: 190 },
      { x: 395, y: 115 },
    ],
    edges: [
      ['А', 'Б'],
      ['А', 'В'],
      ['Б', 'Г'],
      ['Б', 'Д'],
      ['В', 'Д'],
      ['Г', 'Е'],
      ['Д', 'Е'],
      ['Д', 'Ж'],
      ['Е', 'З'],
      ['Ж', 'З'],
    ],
  },
};
