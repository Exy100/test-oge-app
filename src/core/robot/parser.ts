export const robotLimits = Object.freeze({
  source: 32_000,
  lines: 2000,
  instructions: 4000,
  nesting: 32,
  repeats: 10_000,
  steps: 10_000,
  trace: 1000,
  side: 100,
});
export type Direction = 'вверх' | 'вниз' | 'влево' | 'вправо';
export type Sensor = 'сверху' | 'снизу' | 'слева' | 'справа' | 'клетка';
export interface Condition {
  sensor: Sensor;
  expected: boolean;
}
export type Instruction =
  | { kind: 'move'; direction: Direction; line: number }
  | { kind: 'paint'; line: number }
  | { kind: 'test'; condition: Condition; no: number; line: number }
  | { kind: 'jump'; target: number; line: number }
  | { kind: 'repeat'; count: number; end: number; line: number }
  | { kind: 'next'; start: number; line: number };
export class RobotSyntaxError extends Error {
  readonly line: number;
  constructor(line: number, message: string) {
    super(`Строка ${String(line)}: ${message}`);
    this.line = line;
    this.name = 'RobotSyntaxError';
  }
}
function condition(text: string, line: number): Condition {
  const negate = text.startsWith('не ');
  const source = negate ? text.slice(3) : text;
  const match = /^(сверху|снизу|слева|справа) (свободно|стена)$/u.exec(source);
  if (match)
    return {
      sensor: match[1] as Sensor,
      expected: (match[2] === 'свободно') !== negate,
    };
  if (source === 'клетка закрашена' || source === 'клетка не закрашена')
    return {
      sensor: 'клетка',
      expected: (source === 'клетка закрашена') !== negate,
    };
  throw new RobotSyntaxError(line, 'Неизвестное условие.');
}
export function compileRobot(source: string): readonly Instruction[] {
  if (source.length > robotLimits.source)
    throw new RobotSyntaxError(1, 'Превышен размер программы.');
  const raw = source.split(/\r\n|\r|\n/u);
  if (raw.length > robotLimits.lines)
    throw new RobotSyntaxError(1, 'Слишком много строк.');
  const lines = raw
    .map((text, index) => ({
      text:
        text.split('|')[0]?.trim().toLowerCase().replace(/\s+/gu, ' ') ?? '',
      line: index + 1,
    }))
    .filter((item) => item.text);
  if (lines[0]?.text === 'использовать робот') lines.shift();
  if (lines[0]?.text.startsWith('алг')) {
    const first = lines.shift();
    if (
      !first ||
      !/^алг(?: [а-яёa-z_][а-яёa-z_0-9 ]*)?$/u.test(first.text) ||
      lines.shift()?.text !== 'нач' ||
      lines.pop()?.text !== 'кон'
    )
      throw new RobotSyntaxError(
        first?.line ?? 1,
        'Ожидается оболочка алг / нач / кон.',
      );
  }
  let position = 0;
  const code: Instruction[] = [];
  function block(stops: readonly string[], depth: number): void {
    if (depth > robotLimits.nesting)
      throw new RobotSyntaxError(
        lines[position]?.line ?? 1,
        'Слишком глубокая вложенность.',
      );
    while (position < lines.length) {
      const current = lines[position];
      if (!current || stops.includes(current.text)) return;
      position += 1;
      const { text, line } = current;
      if (['вверх', 'вниз', 'влево', 'вправо'].includes(text))
        code.push({ kind: 'move', direction: text as Direction, line });
      else if (text === 'закрасить') code.push({ kind: 'paint', line });
      else if (text.startsWith('если ') && text.endsWith(' то')) {
        const branch: Instruction & { kind: 'test' } = {
          kind: 'test',
          condition: condition(text.slice(5, -3), line),
          no: 0,
          line,
        };
        code.push(branch);
        block(['иначе', 'все'], depth + 1);
        if (lines[position]?.text === 'иначе') {
          position += 1;
          const jump: Instruction & { kind: 'jump' } = {
            kind: 'jump',
            target: 0,
            line,
          };
          code.push(jump);
          branch.no = code.length;
          block(['все'], depth + 1);
          jump.target = code.length;
        } else branch.no = code.length;
        if (lines[position++]?.text !== 'все')
          throw new RobotSyntaxError(line, 'Не закрыто условие: нужно все.');
      } else if (text.startsWith('нц пока ')) {
        const start = code.length;
        const branch: Instruction & { kind: 'test' } = {
          kind: 'test',
          condition: condition(text.slice(8), line),
          no: 0,
          line,
        };
        code.push(branch);
        block(['кц'], depth + 1);
        if (lines[position++]?.text !== 'кц')
          throw new RobotSyntaxError(line, 'Не закрыт цикл: нужно кц.');
        code.push({ kind: 'jump', target: start, line });
        branch.no = code.length;
      } else if (/^нц \d+ раз$/u.test(text)) {
        const count = Number(text.split(' ')[1]);
        if (!Number.isSafeInteger(count) || count > robotLimits.repeats)
          throw new RobotSyntaxError(line, 'Слишком много повторений.');
        const start = code.length;
        const repeat: Instruction & { kind: 'repeat' } = {
          kind: 'repeat',
          count,
          end: 0,
          line,
        };
        code.push(repeat);
        block(['кц'], depth + 1);
        if (lines[position++]?.text !== 'кц')
          throw new RobotSyntaxError(line, 'Не закрыт цикл: нужно кц.');
        code.push({ kind: 'next', start, line });
        repeat.end = code.length;
      } else
        throw new RobotSyntaxError(
          line,
          'Неизвестная команда или лишний конец блока.',
        );
      if (code.length > robotLimits.instructions)
        throw new RobotSyntaxError(line, 'Слишком много инструкций.');
    }
  }
  block([], 0);
  return code;
}
