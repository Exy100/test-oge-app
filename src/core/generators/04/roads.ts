export const towns = ['А', 'Б', 'В', 'Г', 'Д', 'Е'] as const;
export type Roads = number[][];
export interface Route {
  path: number[];
  distance: number;
}

export function roadTable(roads: Roads): string {
  return [
    '| Пункт | А | Б | В | Г | Д | Е |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...roads.map(
      (row, index) =>
        `| ${towns[index] ?? ''} | ${row.map((value) => (value ? String(value) : '—')).join(' | ')} |`,
    ),
  ].join('\n');
}

export function readRoads(statement: string): Roads | null {
  if (!statement.includes('| Пункт | А | Б | В | Г | Д | Е |')) return null;
  const rows = statement
    .split('\n')
    .filter((line) => /^\| [АБВГДЕ] \|/u.test(line));
  if (rows.length !== 6) return null;
  const result: Roads = [];
  for (let index = 0; index < 6; index += 1) {
    const cells =
      rows[index]
        ?.split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()) ?? [];
    if (cells.length !== 7 || cells[0] !== towns[index]) return null;
    const row = cells
      .slice(1)
      .map((cell) =>
        cell === '—' ? 0 : /^[1-9][0-9]?$/u.test(cell) ? Number(cell) : -1,
      );
    if (row.some((value) => value < 0 || value > 50) || row[index] !== 0)
      return null;
    result.push(row);
  }
  if (result.some((row, i) => row.some((value, j) => value !== result[j]?.[i])))
    return null;
  return result;
}

/** Depth-first construction of all simple routes, used only by generation. */
export function routes(roads: Roads): Route[] {
  const result: Route[] = [];
  function walk(path: number[], distance: number): void {
    const last = path.at(-1) ?? 0;
    if (last === 5) {
      result.push({ path, distance });
      return;
    }
    for (let next = 0; next < 6; next += 1) {
      const weight = roads[last]?.[next] ?? 0;
      if (weight > 0 && !path.includes(next))
        walk([...path, next], distance + weight);
    }
  }
  walk([0], 0);
  return result;
}

/** Independent subset DP: each state records visited towns and the last town. */
export function shortestDistance(
  roads: Roads,
  required = -1,
  closed = -1,
): number {
  const costs = Array.from({ length: 64 }, () =>
    Array<number>(6).fill(Infinity),
  );
  const first = costs[1];
  if (first) first[0] = 0;
  let best = Infinity;
  for (let mask = 1; mask < 64; mask += 1) {
    for (let last = 0; last < 6; last += 1) {
      const cost = costs[mask]?.[last] ?? Infinity;
      if (!Number.isFinite(cost)) continue;
      if (last === 5) {
        if (required < 0 || (mask & (1 << required)) !== 0)
          best = Math.min(best, cost);
        continue;
      }
      for (let next = 0; next < 6; next += 1) {
        const weight = roads[last]?.[next] ?? 0;
        if (next === closed || (mask & (1 << next)) !== 0 || weight === 0)
          continue;
        const row = costs[mask | (1 << next)];
        if (row) row[next] = Math.min(row[next] ?? Infinity, cost + weight);
      }
    }
  }
  return best;
}
