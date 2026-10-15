import { Rng } from '../../rng.ts';

export const programKinds = [
  'python-filter',
  'python-digits',
  'python-pairs',
  'python-run',
] as const;
export type ProgramKind = (typeof programKinds)[number];
export const isProgramKind = (value: string): value is ProgramKind =>
  programKinds.some((kind) => kind === value);
export type ProgramParameters =
  | { kind: 'python-filter'; divisor: number; threshold: number }
  | { kind: 'python-digits'; divisor: number }
  | { kind: 'python-pairs'; divisor: number }
  | { kind: 'python-run'; threshold: number };
export interface ProgramCase {
  id: string;
  label: string;
  input: string;
  output: string;
}
export const programLimits = {
  count: 1000,
  value: 10000,
  natural: 999999999999,
} as const;

function integer(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Недопустимые параметры или входные данные программы.');
}
export function validateProgramParameters(p: ProgramParameters): void {
  if (!isProgramKind(p.kind)) throw new Error('Неизвестный подтип программы.');
  if (p.kind !== 'python-run') integer(p.divisor, 2, 9);
  if (p.kind === 'python-filter' || p.kind === 'python-run')
    integer(p.threshold, -100, 100);
  const keys =
    p.kind === 'python-filter'
      ? ['kind', 'divisor', 'threshold']
      : p.kind === 'python-run'
        ? ['kind', 'threshold']
        : ['kind', 'divisor'];
  if (
    Object.keys(p).length !== keys.length ||
    Object.keys(p).some((key) => !keys.includes(key))
  )
    throw new Error('Неизвестные поля параметров программы.');
}
export function programParameters(
  kind: ProgramKind,
  seed: string,
): ProgramParameters {
  const rng = new Rng(`${kind}:parameters:${seed}`);
  if (kind === 'python-run') return { kind, threshold: rng.int(-90, 90) };
  const divisor = rng.int(2, 9);
  return kind === 'python-filter'
    ? { kind, divisor, threshold: rng.int(-10, 10) * divisor }
    : { kind, divisor };
}
export function sequenceInput(values: readonly number[]): string {
  return `${String(values.length)}\n${values.join('\n')}\n`;
}
export function parseProgramInput(
  p: ProgramParameters,
  input: string,
): number[] {
  validateProgramParameters(p);
  if (
    input.length > 20000 ||
    !/^(?:0|-?[1-9]\d*)(?:\r?\n(?:0|-?[1-9]\d*))*\r?\n?$/u.test(input)
  )
    throw new Error('На каждой строке должно быть одно целое число.');
  const values = input.trimEnd().split(/\r?\n/u).map(Number);
  if (p.kind === 'python-digits') {
    if (values.length !== 1)
      throw new Error('Ожидается одно неотрицательное число.');
    integer(values[0] ?? -1, 0, programLimits.natural);
    return values;
  }
  const count = values.shift() ?? 0;
  integer(count, 1, programLimits.count);
  if (values.length !== count)
    throw new Error('Количество чисел не совпало с N.');
  for (const value of values)
    integer(value, -programLimits.value, programLimits.value);
  return values;
}
/** A declarative oracle; the Python references use streaming loops. */
export function expectedProgramOutput(
  p: ProgramParameters,
  input: string,
): string {
  const values = parseProgramInput(p, input);
  if (p.kind === 'python-filter' || p.kind === 'python-digits') {
    const selected = (
      p.kind === 'python-digits'
        ? Array.from(String(values[0])).map(Number)
        : values
    ).filter(
      (value) =>
        value % p.divisor === 0 &&
        (p.kind !== 'python-filter' || value >= p.threshold),
    );
    return `${String(selected.length)} ${String(selected.reduce((sum, value) => sum + value, 0))}\n`;
  }
  if (p.kind === 'python-pairs') {
    const sums = values
      .slice(1)
      .map((value, index) => value + (values[index] ?? 0))
      .filter((sum) => sum % p.divisor === 0);
    return `${String(sums.length)} ${String(sums.length ? Math.max(...sums) : 0)}\n`;
  }
  const runs = values
    .map((value) => (value >= p.threshold ? '1' : '0'))
    .join('')
    .split('0');
  return `${String(Math.max(...runs.map((run) => run.length)))}\n`;
}
export function programCases(
  p: ProgramParameters,
  seed: string,
): readonly ProgramCase[] {
  validateProgramParameters(p);
  const rng = new Rng(`${p.kind}:cases:${seed}`);
  let inputs: readonly [string, string][];
  if (p.kind === 'python-digits') {
    const values = [
      rng.int(0, 999999) * 1000000 + rng.int(0, 999999),
      0,
      1,
      9,
      10,
      100000000000,
      programLimits.natural,
      111111111111,
      Number(String(p.divisor).repeat(12)),
      102030405060,
    ];
    const labels = [
      'Пример',
      'Ноль — одна цифра',
      'Нет подходящих цифр',
      'Однозначное число',
      'Ноль в конце',
      'Длинная цепочка нулей',
      'Верхняя граница',
      'Все цифры не подходят',
      'Все цифры подходят',
      'Чередование цифр и нулей',
    ];
    inputs = values.map((value, index) => [
      labels[index] ?? '',
      `${String(value)}\n`,
    ]);
  } else {
    const random = Array.from({ length: rng.int(6, 20) }, () =>
      rng.int(-100, 100),
    );
    let sequences: readonly [string, readonly number[]][];
    if (p.kind === 'python-filter') {
      const accepted = Math.ceil(p.threshold / p.divisor) * p.divisor;
      sequences = [
        ['Пример', random],
        ['Одно подходящее число', [accepted]],
        ['Нет подходящих чисел', [-10000]],
        [
          'Граница включается',
          [p.threshold - p.divisor, p.threshold, p.threshold + p.divisor],
        ],
        ['Ноль и знаки', [0, -p.divisor, p.divisor]],
        ['Границы значений', [-10000, 10000]],
        ['Проверка остатка', [accepted, accepted + 1, accepted - 1]],
        [
          'Все подходят',
          Array.from(
            { length: 12 },
            (_, index) => accepted + index * p.divisor,
          ),
        ],
        ['Повторяющиеся значения', [accepted, accepted, accepted]],
        [
          'Максимальное N',
          Array.from({ length: 1000 }, () => rng.int(-10000, 10000)),
        ],
      ];
    } else if (p.kind === 'python-pairs') {
      sequences = [
        ['Пример', random],
        ['Пары отсутствуют', [0]],
        ['Нулевая сумма', [p.divisor, -p.divisor]],
        ['Отрицательный максимум', [-p.divisor, -p.divisor]],
        ['Ни одна пара не подходит', [0, 1]],
        ['Перекрывающиеся пары', [p.divisor, p.divisor, p.divisor]],
        ['Границы значений', [10000, -10000, 10000]],
        ['Только нули', [0, 0, 0, 0]],
        ['Максимум меняется', [-p.divisor, -p.divisor, p.divisor, p.divisor]],
        [
          'Максимальное N',
          Array.from({ length: 1000 }, (_, index) =>
            index % 2 ? 10000 : -10000,
          ),
        ],
      ];
    } else {
      const t = p.threshold;
      sequences = [
        ['Пример', random],
        ['Равенство порогу', [t]],
        ['Ни одного подходящего', [t - 1]],
        ['Сброс длины', [t, t - 1, t]],
        ['Цепочка в конце', [t - 1, t, t]],
        ['Цепочка в начале', [t, t, t - 1]],
        ['Равные максимумы', [t, t, t - 1, t, t]],
        ['Границы значений', [-10000, 10000]],
        ['Максимальное N, все подходят', Array.from({ length: 1000 }, () => t)],
        [
          'Максимальное N, разрывы',
          Array.from({ length: 1000 }, (_, index) => (index % 2 ? t : t - 1)),
        ],
      ];
    }
    inputs = sequences.map(([label, values]) => [label, sequenceInput(values)]);
  }
  return inputs.map(([label, input], index) => ({
    id: String(index + 1).padStart(2, '0'),
    label,
    input,
    output: expectedProgramOutput(p, input),
  }));
}
export function equalProgramOutput(expected: string, actual: string): boolean {
  const normalize = (value: string): string | undefined => {
    if (value.length > 1024 || !value.trim()) return undefined;
    const tokens = value.trim().split(/\s+/u);
    if (
      tokens.some(
        (token) =>
          !/^[+-]?\d+$/u.test(token) || !Number.isSafeInteger(Number(token)),
      )
    )
      return undefined;
    return tokens.map((token) => String(Number(token))).join(' ');
  };
  const target = normalize(expected);
  return target !== undefined && target === normalize(actual);
}
export interface ProgramRunEvidence {
  stdout: string;
  exitCode: number | null;
  timedOut: boolean;
}
/** Assess evidence from separate local runs; this does not execute Python. */
export function assessProgramRuns(
  p: ProgramParameters,
  seed: string,
  runs: readonly ProgramRunEvidence[],
) {
  const cases = programCases(p, seed);
  if (runs.length !== cases.length)
    throw new Error('Нужен результат каждого из десяти тестов.');
  const results = cases.map((item, index) => {
    const run = runs[index];
    return {
      id: item.id,
      success:
        run !== undefined &&
        run.exitCode === 0 &&
        !run.timedOut &&
        equalProgramOutput(item.output, run.stdout),
    };
  });
  const passed = results.filter((item) => item.success).length;
  const score: 0 | 1 | 2 = passed === cases.length ? 2 : passed > 0 ? 1 : 0;
  return { score, passed, total: cases.length, results };
}
