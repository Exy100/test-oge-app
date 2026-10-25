import type { QueryProblem } from '../../core/generators/exam/short-problems';
export type SearchExpression =
  | { kind: 'word'; bit: 1 | 2 | 4 }
  | { kind: 'not'; value: SearchExpression }
  | { kind: 'and' | 'or'; left: SearchExpression; right: SearchExpression };
export const regionNames = [
  'Ни A, ни B, ни C',
  'Только A',
  'Только B',
  'A и B без C',
  'Только C',
  'A и C без B',
  'B и C без A',
  'A, B и C',
] as const;
export const initialRegions = [2, 3, 4, 5, 6, 7, 8, 9] as const;
export const searchGoals = {
  union: { title: 'Есть A или B (включая оба)', query: 'A | B' },
  intersection: { title: 'Есть одновременно A и B', query: 'A & B' },
  conditional: { title: 'Есть A и хотя бы одно из B, C', query: 'A & (B | C)' },
  triple: { title: 'Есть все три слова A, B, C', query: 'A & B & C' },
  pair: { title: 'Есть одновременно A и C', query: 'A & C' },
} as const;
/** Bounded grammar for the lesson's query language; never executes source code. */
export function parseSearch(source: string): SearchExpression {
  if (!source.trim() || source.length > 160)
    throw new RangeError(
      'Введи запрос до 160 знаков: A, B, C, &, |, НЕ и скобки.',
    );
  const normalized = source
    .toUpperCase()
    .replaceAll('А', 'A')
    .replaceAll('В', 'B')
    .replaceAll('С', 'C');
  const tokens = normalized.match(/ИЛИ|НЕ|И|[ABC&|!()]|\S/gu) ?? [];
  let position = 0;
  function atom(depth: number): SearchExpression {
    if (depth > 24)
      throw new RangeError('Слишком много вложенных скобок или отрицаний.');
    const token = tokens[position++];
    if (token === 'НЕ' || token === '!')
      return { kind: 'not', value: atom(depth + 1) };
    if (token === 'A' || token === 'B' || token === 'C')
      return { kind: 'word', bit: token === 'A' ? 1 : token === 'B' ? 2 : 4 };
    if (token === '(') {
      const result = expression(depth + 1);
      if (tokens[position++] !== ')') throw new RangeError('Закрой скобку.');
      return result;
    }
    throw new RangeError('Здесь ожидается A, B, C, НЕ или открывающая скобка.');
  }
  function conjunction(depth: number): SearchExpression {
    let left = atom(depth);
    while (tokens[position] === '&' || tokens[position] === 'И') {
      position++;
      left = { kind: 'and', left, right: atom(depth) };
    }
    return left;
  }
  function expression(depth: number): SearchExpression {
    let left = conjunction(depth);
    while (tokens[position] === '|' || tokens[position] === 'ИЛИ') {
      position++;
      left = { kind: 'or', left, right: conjunction(depth) };
    }
    return left;
  }
  const result = expression(0);
  if (position !== tokens.length)
    throw new RangeError(
      'Между частями нужен И (&) или ИЛИ (|); проверь лишние знаки.',
    );
  return result;
}
export function searchHolds(
  node: SearchExpression,
  membership: number,
): boolean {
  switch (node.kind) {
    case 'word':
      return (membership & node.bit) !== 0;
    case 'not':
      return !searchHolds(node.value, membership);
    case 'and':
      return (
        searchHolds(node.left, membership) &&
        searchHolds(node.right, membership)
      );
    case 'or':
      return (
        searchHolds(node.left, membership) ||
        searchHolds(node.right, membership)
      );
  }
}
export function searchRegions(source: string, counts: readonly number[]) {
  if (
    counts.length !== 8 ||
    counts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 10000)
  )
    throw new RangeError(
      'В каждой из восьми областей нужно целое число страниц от 0 до 10000.',
    );
  const expression = parseSearch(source);
  const selected = counts.map((_, membership) =>
    searchHolds(expression, membership),
  );
  return {
    selected,
    total: counts.reduce((sum, n, index) => sum + (selected[index] ? n : 0), 0),
  };
}
export function compareSearch(
  source: string,
  target: string,
  counts: readonly number[],
) {
  const actual = searchRegions(source, counts),
    expected = searchRegions(target, counts);
  const mismatch = actual.selected.findIndex(
    (value, index) => value !== expected.selected[index],
  );
  return { actual, expected, equivalent: mismatch === -1, mismatch };
}
/** Within A, B and C become two overlapping sets; outside A is irrelevant. */
export function conditionalSearch(
  counts: readonly number[],
  kind: 'triple' | 'pair',
): QueryProblem {
  const union = searchRegions('A & (B | C)', counts).total;
  const left = searchRegions('A & B', counts).total;
  return {
    kind: 'search',
    union,
    left,
    ...(kind === 'triple'
      ? { right: searchRegions('A & C', counts).total }
      : { both: searchRegions('A & B & C', counts).total }),
  };
}
