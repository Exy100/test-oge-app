export type Comparison = '<' | '≤' | '>' | '≥';
export type LogicNode =
  | { kind: 'compare'; op: Comparison; value: number }
  | { kind: 'not'; child: LogicNode }
  | { kind: 'and' | 'or'; left: LogicNode; right: LogicNode };
export type LogicGoal = 'count' | 'min' | 'max';
export type LogicProblem = {
  expression: LogicNode;
  lower: number;
  upper: number;
  target: boolean;
  goal: LogicGoal;
};
export const goalNames = {
  count: 'Количество чисел',
  min: 'Наименьшее число',
  max: 'Наибольшее число',
};
export const truthName = (value: boolean) => (value ? 'Истина' : 'Ложь');
export function logicValue(node: LogicNode, x: number): boolean {
  switch (node.kind) {
    case 'compare':
      switch (node.op) {
        case '<':
          return x < node.value;
        case '≤':
          return x <= node.value;
        case '>':
          return x > node.value;
        case '≥':
          return x >= node.value;
      }
      throw new RangeError('Неизвестный знак сравнения.');
    case 'not':
      return !logicValue(node.child, x);
    case 'and':
      return logicValue(node.left, x) && logicValue(node.right, x);
    case 'or':
      return logicValue(node.left, x) || logicValue(node.right, x);
  }
}
export function logicLabel(node: LogicNode): string {
  if (node.kind === 'compare') return `X ${node.op} ${String(node.value)}`;
  if (node.kind === 'not') return `НЕ (${logicLabel(node.child)})`;
  return `(${logicLabel(node.left)}) ${node.kind === 'and' ? 'И' : 'ИЛИ'} (${logicLabel(node.right)})`;
}
export function negateLogic(node: LogicNode): LogicNode {
  if (node.kind === 'not') return node.child;
  if (node.kind === 'compare') {
    const inverse: Record<Comparison, Comparison> = {
      '<': '≥',
      '≥': '<',
      '>': '≤',
      '≤': '>',
    };
    return { ...node, op: inverse[node.op] };
  }
  return {
    kind: node.kind === 'and' ? 'or' : 'and',
    left: negateLogic(node.left),
    right: negateLogic(node.right),
  };
}
export function logicTrace(
  node: LogicNode,
  x: number,
): { label: string; result: boolean; explanation: string }[] {
  const result = logicValue(node, x);
  const row = {
    label: logicLabel(node),
    result,
    explanation:
      node.kind === 'compare'
        ? `Подставляем ${String(x)} вместо X. Равенство допускают только знаки ≤ и ≥.`
        : node.kind === 'not'
          ? 'НЕ меняет истину на ложь и ложь на истину. Отрицание относится ко всему выражению в скобках.'
          : node.kind === 'and'
            ? 'Для И обе части должны быть истинны.'
            : 'Для ИЛИ достаточно хотя бы одной истинной части. Обе истинны — тоже подходит.',
  };
  return node.kind === 'compare'
    ? [row]
    : node.kind === 'not'
      ? [...logicTrace(node.child, x), row]
      : [...logicTrace(node.left, x), ...logicTrace(node.right, x), row];
}
export function logicProblem(variant: number): LogicProblem {
  const a = 5 + ((Math.floor(variant / 4) * 3) % 9);
  const b = a + 4 + (Math.floor(variant / 8) % 3);
  const left: LogicNode = { kind: 'compare', op: '<', value: a };
  const right: LogicNode = { kind: 'compare', op: '<', value: b };
  const templates: LogicProblem[] = [
    {
      expression: { kind: 'and', left: { kind: 'not', child: left }, right },
      lower: 1,
      upper: b + 3,
      target: true,
      goal: 'count',
    },
    {
      expression: {
        kind: 'or',
        left,
        right: { kind: 'compare', op: '>', value: b },
      },
      lower: 1,
      upper: b + 3,
      target: false,
      goal: 'min',
    },
    {
      expression: {
        kind: 'not',
        child: {
          kind: 'or',
          left,
          right: { kind: 'compare', op: '>', value: b },
        },
      },
      lower: 0,
      upper: b + 3,
      target: true,
      goal: 'max',
    },
    {
      expression: {
        kind: 'and',
        left: { kind: 'compare', op: '≥', value: a },
        right: { kind: 'compare', op: '≤', value: b },
      },
      lower: 1,
      upper: b + 3,
      target: false,
      goal: 'count',
    },
  ];
  const problem = templates[variant % 4];
  if (!problem) throw new RangeError('Неизвестный вариант.');
  return problem;
}
export function logicDomain(problem: LogicProblem): number[] {
  return Array.from(
    { length: problem.upper - problem.lower + 1 },
    (_, i) => problem.lower + i,
  );
}
export function logicSolutions(problem: LogicProblem): number[] {
  return logicDomain(problem).filter(
    (x) => logicValue(problem.expression, x) === problem.target,
  );
}
export function logicAnswer(problem: LogicProblem): number {
  const values = logicSolutions(problem);
  if (problem.goal === 'count') return values.length;
  const answer = problem.goal === 'min' ? values[0] : values.at(-1);
  if (answer === undefined) throw new RangeError('Нет подходящих чисел.');
  return answer;
}
