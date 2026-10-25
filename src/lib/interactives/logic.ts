export type BooleanExpression =
  | { kind: 'variable'; name: 'A' | 'B' }
  | { kind: 'not'; value: BooleanExpression }
  | { kind: 'and' | 'or'; left: BooleanExpression; right: BooleanExpression };

/** Bounded grammar, never JavaScript evaluation. НЕ binds before И, then ИЛИ. */
export function parseBoolean(source: string): BooleanExpression {
  if (!source.trim() || source.length > 160)
    throw new RangeError(
      'Введи выражение до 160 знаков: A, B, НЕ, И, ИЛИ и скобки.',
    );
  const normalized = source
    .toUpperCase()
    .replaceAll('А', 'A')
    .replaceAll('В', 'B');
  const tokens = normalized.match(/ИЛИ|НЕ|И|A|B|[()]|\S/gu) ?? [];
  let position = 0;
  function atom(depth: number): BooleanExpression {
    if (depth > 24)
      throw new RangeError('Слишком много вложенных скобок или отрицаний.');
    const token = tokens[position++];
    if (token === 'НЕ') return { kind: 'not', value: atom(depth + 1) };
    if (token === 'A' || token === 'B')
      return { kind: 'variable', name: token };
    if (token === '(') {
      const result = expression(depth + 1);
      if (tokens[position++] !== ')') throw new RangeError('Закрой скобку.');
      return result;
    }
    throw new RangeError('Здесь ожидается A, B, НЕ или открывающая скобка.');
  }
  function conjunction(depth: number): BooleanExpression {
    let left = atom(depth);
    while (tokens[position] === 'И') {
      position++;
      left = { kind: 'and', left, right: atom(depth) };
    }
    return left;
  }
  function expression(depth: number): BooleanExpression {
    let left = conjunction(depth);
    while (tokens[position] === 'ИЛИ') {
      position++;
      left = { kind: 'or', left, right: conjunction(depth) };
    }
    return left;
  }
  const result = expression(0);
  if (position !== tokens.length)
    throw new RangeError(
      'Между частями выражения нужен И или ИЛИ; проверь лишние знаки и скобки.',
    );
  return result;
}

export function booleanValue(
  node: BooleanExpression,
  a: boolean,
  b: boolean,
): boolean {
  switch (node.kind) {
    case 'variable':
      return node.name === 'A' ? a : b;
    case 'not':
      return !booleanValue(node.value, a, b);
    case 'and':
      return booleanValue(node.left, a, b) && booleanValue(node.right, a, b);
    case 'or':
      return booleanValue(node.left, a, b) || booleanValue(node.right, a, b);
  }
}

export function compareBoolean(source: string, target: string) {
  const expression = parseBoolean(source),
    goal = parseBoolean(target);
  const rows = [false, true].flatMap((a) =>
    [false, true].map((b) => ({
      a,
      b,
      actual: booleanValue(expression, a, b),
      expected: booleanValue(goal, a, b),
    })),
  );
  return { rows, equivalent: rows.every((row) => row.actual === row.expected) };
}

export const logicGoals = {
  and: { title: 'Оба высказывания истинны', expression: 'A И B' },
  neither: {
    title: 'Ни одно высказывание не истинно',
    expression: 'НЕ (A ИЛИ B)',
  },
  difference: { title: 'A истинно, B ложно', expression: 'A И НЕ B' },
} as const;
