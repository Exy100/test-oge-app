/** Subject parameters shared by exam-format generators and their executable examples.
 * Official fixtures stay in tests/ and are never imported here.
 */
export type DeletedWordProblem = {
  kind: 'deleted-word';
  bits: number;
  bytes: number;
  words: readonly string[];
};
export type LogicPredicate =
  | readonly ['gt' | 'ge' | 'le' | 'eq', number]
  | readonly ['odd']
  | readonly ['not', LogicPredicate]
  | readonly ['and' | 'or', LogicPredicate, LogicPredicate];
export type LogicProblem = {
  kind: 'logic';
  predicate: LogicPredicate;
  mode: 'count-true' | 'min-false';
};
export type RoadProblem = {
  kind: 'roads';
  edges: readonly (readonly [string, string, number])[];
  end: string;
};
export type ExecutorProblem = {
  kind: 'executor';
  start: number;
  end: number;
  multiplier?: number;
  square?: boolean;
  add: number;
  limit: number;
};
export type ParameterProblem = {
  kind: 'program-parameter';
  pairs: readonly (readonly [number, number])[];
  variable: 's' | 't';
  fixed: number;
  mode: 'min' | 'max' | 'any';
  yes: number;
};
export type QueryProblem = {
  kind: 'search';
  union: number;
  left: number;
  right?: number;
  both?: number;
};
export type NumeralProblem = {
  kind: 'numerals';
  terms: readonly (readonly [string, number])[];
};
export type UrlProblem = {
  kind: 'url';
  target: string;
  fragments: readonly string[];
};
export type PathProblem = {
  kind: 'paths';
  edges: readonly (readonly [string, string])[];
  end: string;
};
export type DecodeProblem = {
  kind: 'decode';
  codes: Readonly<Record<string, string>>;
  encoded: string;
  repeatedOnly?: boolean;
};
export type ExamShortProblem =
  | DeletedWordProblem
  | LogicProblem
  | RoadProblem
  | ExecutorProblem
  | ParameterProblem
  | QueryProblem
  | NumeralProblem
  | UrlProblem
  | PathProblem
  | DecodeProblem;

function integer(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError('Некорректный параметр экзаменационной задачи.');
}
export function deletedWords(p: DeletedWordProblem): string[] {
  integer(p.words.length, 4, 12);
  integer(p.bytes, 1, 100);
  if (
    ![8, 16].includes(p.bits) ||
    new Set(p.words).size !== p.words.length ||
    p.words.some((word) => !/^[А-ЯЁа-яё-]{1,24}$/u.test(word))
  )
    throw new RangeError('Некорректные слова или размер символа.');
  const removedCharacters = (p.bytes * 8) / p.bits;
  return p.words.filter((word) => word.length + 2 === removedCharacters);
}
export function logicHolds(p: LogicPredicate, x: number): boolean {
  switch (p[0]) {
    case 'gt':
      return x > p[1];
    case 'ge':
      return x >= p[1];
    case 'le':
      return x <= p[1];
    case 'eq':
      return x === p[1];
    case 'odd':
      return x % 2 === 1;
    case 'not':
      return !logicHolds(p[1], x);
    case 'and':
      return logicHolds(p[1], x) && logicHolds(p[2], x);
    case 'or':
      return logicHolds(p[1], x) || logicHolds(p[2], x);
  }
}
/** Between comparison boundaries, truth is constant separately for odd and even X.
 * The infinite tail is checked explicitly; no arbitrary enumeration cutoff is used.
 */
export function logicAnswer(p: LogicProblem): number {
  const boundaries = new Set([1]);
  let nodes = 0;
  function inspect(expression: LogicPredicate, depth: number): void {
    if (++nodes > 64 || depth > 8)
      throw new RangeError('Слишком сложное выражение.');
    switch (expression[0]) {
      case 'not':
        inspect(expression[1], depth + 1);
        break;
      case 'and':
      case 'or':
        inspect(expression[1], depth + 1);
        inspect(expression[2], depth + 1);
        break;
      case 'gt':
      case 'ge':
      case 'le':
      case 'eq':
        integer(expression[1], 1, 1000);
        boundaries.add(expression[1]);
        boundaries.add(expression[1] + 1);
        break;
      case 'odd':
        break;
    }
  }
  inspect(p.predicate, 0);
  const starts = [...boundaries].sort((a, b) => a - b);
  let total = 0,
    firstFalse = Infinity;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i] ?? 1,
      end = starts[i + 1] ?? Infinity;
    for (const parity of [0, 1]) {
      const first = start % 2 === parity ? start : start + 1;
      if (first >= end) continue;
      if (logicHolds(p.predicate, first)) {
        if (end === Infinity && p.mode === 'count-true')
          throw new RangeError('Множество истинных натуральных X бесконечно.');
        total += Math.ceil((end - first) / 2);
      } else firstFalse = Math.min(firstFalse, first);
    }
  }
  if (p.mode === 'min-false' && !Number.isFinite(firstFalse))
    throw new RangeError('Нет натурального X с ложным выражением.');
  return p.mode === 'count-true' ? total : firstFalse;
}
/** Dijkstra on the undirected table; construction and fixture oracle enumerate routes. */
export function roadDistances(p: RoadProblem): ReadonlyMap<string, number> {
  const names = new Set(['A', p.end, ...p.edges.flatMap(([a, b]) => [a, b])]);
  if (
    names.size < 2 ||
    names.size > 8 ||
    p.edges.length > 28 ||
    [...names].some((name) => !/^[A-H]$/u.test(name))
  )
    throw new RangeError('Некорректная таблица дорог.');
  const pairs = new Set<string>();
  for (const [a, b, distance] of p.edges) {
    integer(distance, 1, 99);
    const key = [a, b].sort().join(':');
    if (a === b || pairs.has(key))
      throw new RangeError('Повтор дороги или петля.');
    pairs.add(key);
  }
  const distances = new Map(
      [...names].map((name) => [name, name === 'A' ? 0 : Infinity]),
    ),
    pending = new Set(names);
  while (pending.size) {
    const from = [...pending].sort(
      (a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity),
    )[0];
    if (from === undefined) break;
    pending.delete(from);
    for (const [a, b, length] of p.edges) {
      const next = a === from ? b : b === from ? a : undefined;
      if (next !== undefined)
        distances.set(
          next,
          Math.min(
            distances.get(next) ?? Infinity,
            (distances.get(from) ?? Infinity) + length,
          ),
        );
    }
  }
  if (!Number.isFinite(distances.get(p.end)))
    throw new RangeError('Нет пути до конечного пункта.');
  return distances;
}
export function executeCommands(p: ExecutorProblem, program: string): bigint {
  if (p.limit > 5 || program.length > p.limit)
    throw new RangeError('Программа длиннее допустимой.');
  let value = BigInt(p.start);
  for (const command of program) {
    if (command === '1')
      value = p.square ? value * value : value * BigInt(p.multiplier ?? 1);
    else if (command === '2') value += BigInt(p.add);
    else throw new TypeError('Используй только команды 1 и 2.');
  }
  return value;
}
function squareRoot(value: bigint): bigint | null {
  let lo = 0n,
    hi = value + 1n;
  while (hi - lo > 1n) {
    const middle = (lo + hi) / 2n;
    if (middle * middle <= value) lo = middle;
    else hi = middle;
  }
  return lo * lo === value ? lo : null;
}
/** Reverse the commands, independently of constructive forward generation. */
export function executorSolutions(p: ExecutorProblem): string[] {
  integer(p.start, 2, 100);
  integer(p.end, 1, 100_000);
  integer(p.add, 1, 20);
  integer(p.limit, 1, 5);
  if (!p.square) integer(p.multiplier ?? 0, 2, 10);
  if (p.square && p.multiplier !== undefined)
    throw new TypeError('Укажи квадрат или множитель.');
  const answers = new Set<string>(),
    start = BigInt(p.start),
    multiplier = BigInt(p.multiplier ?? 1);
  const visit = (value: bigint, suffix: string): void => {
    if (value === start && suffix) answers.add(suffix);
    if (suffix.length >= p.limit || value <= start) return;
    const beforeFirst = p.square
      ? squareRoot(value)
      : value % multiplier === 0n
        ? value / multiplier
        : null;
    if (beforeFirst !== null) visit(beforeFirst, '1' + suffix);
    visit(value - BigInt(p.add), '2' + suffix);
  };
  visit(BigInt(p.end), '');
  return [...answers].sort(
    (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  );
}
export function parameterYes(p: ParameterProblem, a: number): number {
  return p.pairs.filter(([s, t]) =>
    p.variable === 's' ? s > a || t > p.fixed : s > p.fixed || t > a,
  ).length;
}
/** Finite plateaux are bounded by input values: no guessed [-100,100] search window. */
export function parameterInterval(p: ParameterProblem): {
  min?: number;
  max?: number;
} {
  integer(p.pairs.length, 9, 9);
  integer(p.fixed, -1000, 1000);
  integer(p.yes, 0, 9);
  const values = p.pairs.map(([s, t]) => {
    integer(s, -1000, 1000);
    integer(t, -1000, 1000);
    return p.variable === 's' ? s : t;
  });
  const lo = Math.min(...values) - 1,
    hi = Math.max(...values) + 1;
  const matches: number[] = [];
  for (let a = lo; a <= hi; a++)
    if (parameterYes(p, a) === p.yes) matches.push(a);
  const min = matches[0],
    max = matches.at(-1);
  if (
    min === undefined ||
    max === undefined ||
    matches.length !== max - min + 1
  )
    throw new RangeError('Нет непрерывного интервала допустимых A.');
  const lower = min === lo ? undefined : min,
    upper = max === hi ? undefined : max;
  if (
    (lower === undefined && upper === undefined) ||
    (p.mode === 'min' && lower === undefined) ||
    (p.mode === 'max' && upper === undefined)
  )
    throw new RangeError('У вопроса нет требуемой конечной границы.');
  return {
    ...(lower !== undefined ? { min: lower } : {}),
    ...(upper !== undefined ? { max: upper } : {}),
  };
}
/** Decode the whole signal by memoised suffix analysis, without a prefix-code assumption. */
export function decodeSolutions(p: DecodeProblem): string[] {
  if (
    !p.encoded ||
    p.encoded.length > 160 ||
    Object.keys(p.codes).length > 8 ||
    Object.entries(p.codes).some(
      ([letter, code]) =>
        !/^[А-ЯЁ]$/u.test(letter) || !/^[.o01~#+-]{1,8}$/u.test(code),
    )
  )
    throw new RangeError('Некорректные кодовая таблица или сигнал.');
  const memo = new Map<number, string[]>();
  function suffix(offset: number): string[] {
    if (offset === p.encoded.length) return [''];
    const cached = memo.get(offset);
    if (cached) return cached;
    const words: string[] = [];
    for (const [letter, code] of Object.entries(p.codes))
      if (p.encoded.startsWith(code, offset))
        for (const rest of suffix(offset + code.length)) {
          words.push(letter + rest);
          if (words.length > 64)
            throw new RangeError('Сигнал допускает слишком много расшифровок.');
        }
    memo.set(offset, words);
    return words;
  }
  const messages = suffix(0);
  if (!p.repeatedOnly) return [...new Set(messages)];
  return [
    ...new Set(
      messages.map((message) =>
        [
          ...new Set(
            Array.from(message).filter(
              (letter) =>
                message.indexOf(letter) !== message.lastIndexOf(letter),
            ),
          ),
        ]
          .sort()
          .join(''),
      ),
    ),
  ];
}
export function numeralSum(p: NumeralProblem): number {
  integer(p.terms.length, 2, 3);
  return p.terms.reduce((sum, [digits, base]) => {
    if (![2, 8, 16].includes(base) || !/^[0-9A-F]{1,12}$/u.test(digits))
      throw new RangeError('Неверная запись числа.');
    let value = 0;
    for (const char of digits) {
      const digit = '0123456789ABCDEF'.indexOf(char);
      if (digit >= base)
        throw new RangeError('Цифра не входит в систему счисления.');
      value = value * base + digit;
    }
    if (!Number.isSafeInteger(sum + value))
      throw new RangeError('Слишком большая сумма.');
    return sum + value;
  }, 0);
}
export function queryAnswer(p: QueryProblem): number {
  for (const value of [p.union, p.left, p.right ?? 0, p.both ?? 0])
    integer(value, 0, 100_000);
  if ((p.right === undefined) === (p.both === undefined))
    throw new TypeError('Нужна ровно одна неизвестная область.');
  const both = p.both ?? p.left + (p.right ?? 0) - p.union;
  const right = p.right ?? p.union - p.left + both;
  if (
    both < 0 ||
    both > p.left ||
    both > right ||
    p.left > p.union ||
    right > p.union
  )
    throw new RangeError('Несовместимые количества страниц.');
  return p.right === undefined ? right : both;
}
export function pathTotals(p: PathProblem): ReadonlyMap<string, number> {
  const names = new Set(['A', p.end, ...p.edges.flatMap(([a, b]) => [a, b])]);
  if (
    names.size < 2 ||
    names.size > 8 ||
    p.edges.length > 28 ||
    new Set(p.edges.map(([a, b]) => a + ':' + b)).size !== p.edges.length
  )
    throw new RangeError('Некорректная схема дорог.');
  const counts = new Map<string, number>([['A', 1]]),
    indegrees = new Map([...names].map((name) => [name, 0]));
  for (const [a, b] of p.edges) {
    if (a === b) throw new RangeError('Петля в схеме дорог.');
    indegrees.set(b, (indegrees.get(b) ?? 0) + 1);
  }
  const order = [...names].filter((name) => indegrees.get(name) === 0);
  for (let i = 0; i < order.length; i++) {
    const from = order[i];
    for (const [a, b] of p.edges)
      if (a === from) {
        counts.set(b, (counts.get(b) ?? 0) + (counts.get(a) ?? 0));
        indegrees.set(b, (indegrees.get(b) ?? 0) - 1);
        if (indegrees.get(b) === 0) order.push(b);
      }
  }
  if (order.length !== names.size) throw new RangeError('Цикл в схеме дорог.');
  return counts;
}
export function pathCount(p: PathProblem): number {
  return pathTotals(p).get(p.end) ?? 0;
}
export function urlOrders(p: UrlProblem): string[] {
  if (
    p.fragments.length !== 7 ||
    new Set(p.fragments).size !== 7 ||
    p.target.length > 160 ||
    p.fragments.some((value) => !value || value.length > 80)
  )
    throw new RangeError('Нужны семь различных фрагментов URL.');
  const orders: string[] = [];
  function visit(prefix: string, remaining: number[], code: string): void {
    if (!remaining.length) {
      if (prefix === p.target) orders.push(code);
      return;
    }
    for (const index of remaining) {
      const next = prefix + (p.fragments[index] ?? '');
      if (p.target.startsWith(next))
        visit(
          next,
          remaining.filter((other) => other !== index),
          code + String(index + 1),
        );
    }
  }
  visit(
    '',
    p.fragments.map((_, index) => index),
    '',
  );
  return orders;
}
