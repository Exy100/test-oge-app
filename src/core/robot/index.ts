import { FigureSpecSchema } from '../schemas/figure.ts';
import type { FigureSpec } from '../types.ts';
import {
  compileRobot,
  robotLimits,
  type Direction,
  type Instruction,
  type Condition,
} from './parser.ts';
export { compileRobot, RobotSyntaxError, robotLimits } from './parser.ts';
export type RobotField = Extract<FigureSpec, { kind: 'robot-field' }>;
type Cell = RobotField['start'];
export type RobotStatus =
  'ready' | 'running' | 'completed' | 'crashed' | 'step_limit' | 'cancelled';
export interface RobotTrace {
  step: number;
  line: number;
  action: Instruction['kind'];
  position: Cell;
  painted: boolean;
  status: RobotStatus;
}
export interface RobotResult {
  status: RobotStatus;
  steps: number;
  position: Cell;
  painted: Cell[];
  trace: RobotTrace[];
  traceTruncated: boolean;
  success: boolean;
  message: string;
}
export interface RobotOptions {
  maxSteps?: number;
  traceLimit?: number;
}
const key = (cell: Cell) => `${String(cell.row)},${String(cell.column)}`;
const edge = (a: Cell, b: Cell) => [key(a), key(b)].sort().join(':');
const deltas: Record<Direction, readonly [number, number]> = {
  вверх: [-1, 0],
  вниз: [1, 0],
  влево: [0, -1],
  вправо: [0, 1],
};
const directions = {
  сверху: 'вверх',
  снизу: 'вниз',
  слева: 'влево',
  справа: 'вправо',
} as const;
function bounded(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError('Некорректный лимит Робота.');
  return value;
}
function validateField(input: RobotField): RobotField {
  bounded(input.rows, 1, robotLimits.side);
  bounded(input.columns, 1, robotLimits.side);
  if (
    input.painted.length > input.rows * input.columns ||
    input.targets.length > input.rows * input.columns ||
    input.walls.length > 2 * input.rows * input.columns
  )
    throw new RangeError('Превышен размер поля Робота.');
  const field = FigureSpecSchema.parse(input);
  if (field.kind !== 'robot-field') throw new Error('Нужно поле Робота.');
  return field;
}
export class RobotExecution {
  readonly #field: RobotField;
  readonly #code: readonly Instruction[];
  readonly #walls: Set<string>;
  readonly #painted: Set<string>;
  readonly #repeats = new Map<number, number>();
  readonly #trace: RobotTrace[] = [];
  readonly #maxSteps: number;
  readonly #traceLimit: number;
  #position: Cell;
  #pc = 0;
  #steps = 0;
  #lastLine = 1;
  #status: RobotStatus = 'ready';
  #truncated = false;
  constructor(source: string, field: RobotField, options: RobotOptions = {}) {
    this.#field = validateField(field);
    this.#code = compileRobot(source);
    this.#position = { ...this.#field.start };
    this.#painted = new Set(this.#field.painted.map(key));
    this.#walls = new Set(
      this.#field.walls.map((wall) => edge(wall.from, wall.to)),
    );
    this.#maxSteps = bounded(
      options.maxSteps ?? robotLimits.steps,
      1,
      robotLimits.steps,
    );
    this.#traceLimit = bounded(
      options.traceLimit ?? robotLimits.trace,
      0,
      robotLimits.trace,
    );
  }
  #destination(direction: Direction): Cell | null {
    const [dr, dc] = deltas[direction];
    const next = {
      row: this.#position.row + dr,
      column: this.#position.column + dc,
    };
    if (
      next.row < 0 ||
      next.column < 0 ||
      next.row >= this.#field.rows ||
      next.column >= this.#field.columns ||
      this.#walls.has(edge(this.#position, next))
    )
      return null;
    return next;
  }
  #sense(condition: Condition): boolean {
    if (condition.kind === 'not') return !this.#sense(condition.operand);
    if (condition.kind === 'and')
      return condition.operands.every((item) => this.#sense(item));
    if (condition.kind === 'or')
      return condition.operands.some((item) => this.#sense(item));
    const actual =
      condition.sensor === 'клетка'
        ? this.#painted.has(key(this.#position))
        : this.#destination(directions[condition.sensor]) !== null;
    return actual === condition.expected;
  }
  /** One VM instruction, including control flow: empty loops consume the budget. */
  step(): RobotTrace | null {
    if (this.#status !== 'ready' && this.#status !== 'running') return null;
    const instruction = this.#code[this.#pc];
    if (!instruction) {
      this.#status = 'completed';
      return null;
    }
    if (this.#steps >= this.#maxSteps) {
      this.#status = 'step_limit';
      return null;
    }
    this.#status = 'running';
    this.#steps += 1;
    this.#lastLine = instruction.line;
    switch (instruction.kind) {
      case 'move': {
        const next = this.#destination(instruction.direction);
        if (next) this.#position = next;
        else this.#status = 'crashed';
        this.#pc += 1;
        break;
      }
      case 'paint':
        this.#painted.add(key(this.#position));
        this.#pc += 1;
        break;
      case 'test':
        this.#pc = this.#sense(instruction.condition)
          ? this.#pc + 1
          : instruction.no;
        break;
      case 'jump':
        this.#pc = instruction.target;
        break;
      case 'repeat':
        if (instruction.count === 0) this.#pc = instruction.end;
        else {
          this.#repeats.set(this.#pc, instruction.count);
          this.#pc += 1;
        }
        break;
      case 'next': {
        const remaining = (this.#repeats.get(instruction.start) ?? 1) - 1;
        if (remaining > 0) {
          this.#repeats.set(instruction.start, remaining);
          this.#pc = instruction.start + 1;
        } else {
          this.#repeats.delete(instruction.start);
          this.#pc += 1;
        }
        break;
      }
    }
    if (this.#status === 'running') {
      if (this.#pc >= this.#code.length) this.#status = 'completed';
      else if (this.#steps >= this.#maxSteps) this.#status = 'step_limit';
    }
    const entry: RobotTrace = {
      step: this.#steps,
      line: instruction.line,
      action: instruction.kind,
      position: { ...this.#position },
      painted: this.#painted.has(key(this.#position)),
      status: this.#status,
    };
    if (this.#trace.length < this.#traceLimit) this.#trace.push(entry);
    else this.#truncated = true;
    return structuredClone(entry);
  }
  cancel(): void {
    if (this.#status === 'ready' || this.#status === 'running')
      this.#status = 'cancelled';
  }
  /** A bounded batch; callers can yield to the browser between batches. */
  run(budget = this.#maxSteps): RobotResult {
    bounded(budget, 1, robotLimits.steps);
    for (let index = 0; index < budget; index += 1) if (!this.step()) break;
    return this.snapshot();
  }
  snapshot(): RobotResult {
    const painted = [...this.#painted]
      .map((value) => {
        const [row, column] = value.split(',').map(Number);
        return { row: row ?? 0, column: column ?? 0 };
      })
      .sort((a, b) => a.row - b.row || a.column - b.column);
    const success =
      this.#status === 'completed' &&
      this.#painted.size === this.#field.targets.length &&
      this.#field.targets.every((cell) => this.#painted.has(key(cell)));
    const messages: Record<RobotStatus, string> = {
      ready: 'Готов к запуску.',
      running: 'Выполнение продолжается.',
      completed: success
        ? 'Все нужные клетки закрашены.'
        : 'Программа завершилась, закраска не совпадает с целью.',
      crashed: `Строка ${String(this.#lastLine)}: Робот столкнулся со стеной. Проверь датчик перед движением.`,
      step_limit: `Строка ${String(this.#lastLine)}: Превышен лимит шагов. Проверь, меняется ли условие цикла, и сократи лишние повторения.`,
      cancelled: 'Выполнение отменено.',
    };
    return {
      status: this.#status,
      steps: this.#steps,
      position: { ...this.#position },
      painted,
      trace: structuredClone(this.#trace),
      traceTruncated: this.#truncated,
      success,
      message: messages[this.#status],
    };
  }
}
export function runRobot(
  source: string,
  field: RobotField,
  options: RobotOptions = {},
): RobotResult {
  return new RobotExecution(source, field, options).run();
}
