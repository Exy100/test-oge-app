import type { ParameterProblem } from '../../core/generators/exam/short-problems';
export type ProgramKind = 'assign' | 'branch' | 'for' | 'while';
type Expression =
  | number
  | string
  | readonly [
      '+' | '-' | '*' | '%' | '//' | '>' | '>=' | '==' | 'or',
      Expression,
      Expression,
    ];
type Node =
  | { kind: 'read'; name: string }
  | { kind: 'set'; name: string; value: Expression }
  | { kind: 'if'; condition: Expression; yes: Node[]; no: Node[] }
  | { kind: 'for'; name: string; end: Expression; body: Node[] }
  | { kind: 'while'; condition: Expression; body: Node[] }
  | { kind: 'print'; value: Expression; literal?: boolean };
export interface TraceStep {
  line: number;
  action: string;
  values: Readonly<Record<string, number>>;
  output: string;
}
export const parameterLab: ParameterProblem = {
  kind: 'program-parameter',
  pairs: [
    [-2, -1],
    [0, 0],
    [1, -1],
    [2, 0],
    [5, -2],
    [4, 1],
    [7, -3],
    [6, 2],
    [10, 0],
  ],
  variable: 's',
  fixed: 0,
  yes: 5,
  mode: 'min',
};
export const programTitles: Record<ProgramKind, string> = {
  assign: 'Переменные и присваивания',
  branch: 'Условие и девять запусков',
  for: 'Цикл for: сумма чётных',
  while: 'Цикл while: сумма цифр',
};
function nodes(kind: ProgramKind, a: number): Node[] {
  const read = (name: string): Node => ({ kind: 'read', name });
  const set = (name: string, value: Expression): Node => ({
    kind: 'set',
    name,
    value,
  });
  const print = (value: Expression, literal = false): Node => ({
    kind: 'print',
    value,
    literal,
  });
  switch (kind) {
    case 'assign':
      return [
        read('x'),
        read('y'),
        set('x', ['+', 'x', 'y']),
        set('y', ['-', 'x', 'y']),
        set('x', ['*', 'x', 'y']),
        print('x'),
      ];
    case 'branch':
      return [
        read('s'),
        read('t'),
        {
          kind: 'if',
          condition: ['or', ['>', 's', a], ['>', 't', 0]],
          yes: [print('YES', true)],
          no: [print('NO', true)],
        },
      ];
    case 'for':
      return [
        read('n'),
        set('s', 0),
        {
          kind: 'for',
          name: 'i',
          end: 'n',
          body: [
            {
              kind: 'if',
              condition: ['==', ['%', 'i', 2], 0],
              yes: [set('s', ['+', 's', 'i'])],
              no: [],
            },
          ],
        },
        print('s'),
      ];
    case 'while':
      return [
        read('n'),
        set('s', 0),
        {
          kind: 'while',
          condition: ['>', 'n', 0],
          body: [
            set('digit', ['%', 'n', 10]),
            set('s', ['+', 's', 'digit']),
            set('n', ['//', 'n', 10]),
          ],
        },
        print('s'),
      ];
  }
}
function expressionText(e: Expression): string {
  return typeof e === 'number'
    ? String(e)
    : typeof e === 'string'
      ? e
      : `(${expressionText(e[1])} ${e[0]} ${expressionText(e[2])})`;
}
/** Render and execute the same bounded tree. No source-string evaluation. */
export function traceProgram(
  kind: ProgramKind,
  input: readonly number[],
  a = 2,
) {
  if (
    !(kind in programTitles) ||
    !Number.isSafeInteger(a) ||
    Math.abs(a) > 1000 ||
    input.length !== (kind === 'assign' || kind === 'branch' ? 2 : 1) ||
    input.some(
      (value) => !Number.isSafeInteger(value) || Math.abs(value) > 99999,
    ) ||
    (kind === 'for' && ((input[0] ?? -1) < 0 || (input[0] ?? 21) > 20)) ||
    (kind === 'while' && (input[0] ?? -1) < 0)
  )
    throw new RangeError(
      'Проверь ввод: целые до 99999 по модулю; для for n от 0 до 20, для while n от 0 до 99999. Параметр A — целое от −1000 до 1000.',
    );
  const tree = nodes(kind, a),
    lines: string[] = [],
    positions = new Map<Node, number>();
  function render(block: Node[], indent = ''): void {
    for (const node of block) {
      positions.set(node, lines.length + 1);
      const text =
        node.kind === 'read'
          ? `${node.name} = int(input())`
          : node.kind === 'set'
            ? `${node.name} = ${expressionText(node.value)}`
            : node.kind === 'print'
              ? `print(${node.literal ? JSON.stringify(node.value) : expressionText(node.value)})`
              : node.kind === 'if'
                ? `if ${expressionText(node.condition)}:`
                : node.kind === 'while'
                  ? `while ${expressionText(node.condition)}:`
                  : `for ${node.name} in range(1, ${expressionText(node.end)} + 1):`;
      lines.push(indent + text);
      if (node.kind === 'if') {
        render(node.yes, indent + '    ');
        if (node.no.length) {
          lines.push(indent + 'else:');
          render(node.no, indent + '    ');
        }
      } else if (node.kind === 'for' || node.kind === 'while')
        render(node.body, indent + '    ');
    }
  }
  render(tree);
  const values: Record<string, number> = {},
    steps: TraceStep[] = [];
  let offset = 0,
    output = '';
  function evaluate(e: Expression): number {
    if (typeof e === 'number') return e;
    if (typeof e === 'string') {
      const value = values[e];
      if (value === undefined)
        throw new RangeError('Переменная ещё не задана.');
      return value;
    }
    const left = evaluate(e[1]);
    if (e[0] === 'or' && left !== 0) return 1;
    const right = evaluate(e[2]);
    switch (e[0]) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '%':
        return ((left % right) + right) % right;
      case '//':
        return Math.floor(left / right);
      case '>':
        return Number(left > right);
      case '>=':
        return Number(left >= right);
      case '==':
        return Number(left === right);
      case 'or':
        return Number(right !== 0);
    }
  }
  function record(node: Node, action: string): void {
    if (steps.length >= 300)
      throw new RangeError('Превышено число учебных шагов.');
    steps.push({
      line: positions.get(node) ?? 0,
      action,
      values: { ...values },
      output,
    });
  }
  function execute(block: Node[]): void {
    for (const node of block) {
      switch (node.kind) {
        case 'read':
          values[node.name] = (input[offset++] ?? 0) + 0;
          record(node, `Ввод ${node.name}`);
          break;
        case 'set':
          values[node.name] = evaluate(node.value) + 0;
          record(node, `Обновили ${node.name}`);
          break;
        case 'print':
          output = node.literal
            ? String(node.value)
            : String(evaluate(node.value));
          record(node, `Вывод: ${output}`);
          break;
        case 'if': {
          const yes = evaluate(node.condition) !== 0;
          record(node, `Условие: ${yes ? 'истина' : 'ложь'}`);
          execute(yes ? node.yes : node.no);
          break;
        }
        case 'for': {
          const end = evaluate(node.end);
          for (let i = 1; i <= end; i++) {
            values[node.name] = i;
            record(node, `Итерация ${String(i)}`);
            execute(node.body);
          }
          record(node, 'Диапазон исчерпан');
          break;
        }
        case 'while': {
          while (evaluate(node.condition) !== 0) {
            record(node, 'Условие while: истина');
            execute(node.body);
          }
          record(node, 'Условие while: ложь');
          break;
        }
      }
    }
  }
  execute(tree);
  return { lines, steps, output };
}
