import type { TaskInstance } from '../../../src/core/types';
import type {
  ExamShortProblem,
  LogicPredicate,
} from '../../../src/core/generators/exam/short-problems';

function parseLogic(text: string): LogicPredicate {
  const tokens = text.match(/>=|<=|>|=|\(|\)|НЕ|ИЛИ|И|X|нечётное|\d+/gu) ?? [];
  let offset = 0;
  const take = () => tokens[offset++];
  function expression(): LogicPredicate {
    if (take() !== '(') throw new Error('Expected opening parenthesis');
    let result: LogicPredicate;
    if (tokens[offset] === 'НЕ') {
      take();
      result = ['not', expression()];
    } else if (tokens[offset] === 'X') {
      take();
      const operator = take();
      if (operator === 'нечётное') result = ['odd'];
      else {
        const threshold = take();
        if (!threshold || !/^\d+$/u.test(threshold))
          throw new Error('Invalid threshold');
        const operation =
          operator === '>'
            ? 'gt'
            : operator === '>='
              ? 'ge'
              : operator === '<='
                ? 'le'
                : operator === '='
                  ? 'eq'
                  : null;
        if (!operation) throw new Error('Invalid comparison');
        result = [operation, Number(threshold)];
      }
    } else {
      const left = expression(),
        operation = take(),
        right = expression();
      if (operation !== 'И' && operation !== 'ИЛИ')
        throw new Error('Invalid connective');
      result = [operation === 'И' ? 'and' : 'or', left, right];
    }
    if (take() !== ')') throw new Error('Expected closing parenthesis');
    return result;
  }
  const result = expression();
  if (offset !== tokens.length) throw new Error('Unexpected expression suffix');
  return result;
}

/** Read the actual student-facing statement/diagram, not the generator's hidden recipe. */
export function parseGeneratedProblem(task: TaskInstance): ExamShortProblem {
  const text = task.statement;
  const match = (pattern: RegExp) => {
    const value = pattern.exec(text);
    if (!value)
      throw new Error(`Unrecognised ${task.generatorId}: ${String(pattern)}`);
    return value;
  };
  if (task.taskNumber === 1)
    return {
      kind: 'deleted-word',
      bits: Number(match(/символ занимает (\d+) бит/u)[1]),
      bytes: Number(match(/уменьшился на (\d+) байт/u)[1]),
      words: (match(/список слов: «([^»]+)»/u)[1] ?? '').split(', '),
    };
  if (task.taskNumber === 3)
    return {
      kind: 'logic',
      predicate: parseLogic(match(/Выражение: `([^`]+)`/u)[1] ?? ''),
      mode: text.startsWith('Сколько') ? 'count-true' : 'min-false',
    };
  if (task.taskNumber === 4) {
    const names = (match(/^\| Пункт \| (.+) \|$/mu)[1] ?? '').split(' | '),
      rows = [...text.matchAll(/^\| ([A-H]) \| (.+) \|$/gmu)].map((row) => ({
        name: row[1] ?? '',
        values: (row[2] ?? '').split(' | '),
      })),
      edges: [string, string, number][] = [];
    for (let a = 0; a < names.length; a++)
      for (let b = a + 1; b < names.length; b++) {
        const forward = rows[a]?.values[b],
          backward = rows[b]?.values[a];
        if (rows[a]?.name !== names[a] || forward !== backward)
          throw new Error('Asymmetric road table');
        if (forward !== '—') {
          if (!forward || !/^\d+$/u.test(forward))
            throw new Error('Invalid road length');
          edges.push([names[a] ?? '', names[b] ?? '', Number(forward)]);
        }
      }
    return { kind: 'roads', edges, end: match(/из A в ([A-H])\?/u)[1] ?? '' };
  }
  if (task.taskNumber === 2) {
    const codes = Object.fromEntries<string>(
      [...text.matchAll(/^\| ([А-ЯЁ]) \| `([^`\n]+)` \|$/gmu)].map(
        (row) => [row[1] ?? '', row[2] ?? ''] as const,
      ),
    );
    return {
      kind: 'decode',
      codes,
      encoded: match(/Сигнал: `([^`]+)`/u)[1] ?? '',
      ...(task.subtype === 'decode-repeated' ? { repeatedOnly: true } : {}),
    };
  }
  if (task.taskNumber === 5) {
    const endpoints = match(/переводит число (\d+) в число (\d+)/u),
      square = text.includes('1. Возведи число в квадрат.');
    return {
      kind: 'executor',
      start: Number(endpoints[1]),
      end: Number(endpoints[2]),
      add: Number(match(/Прибавь (\d+)/u)[1]),
      limit: Number(match(/не более (\d+) команд/u)[1]),
      ...(square
        ? { square: true }
        : { multiplier: Number(match(/Умножь на (\d+)/u)[1]) }),
    };
  }
  if (task.taskNumber === 6) {
    const first = /if s > A or t > (-?\d+)/u.exec(text),
      second = first ? null : match(/if s > (-?\d+) or t > A/u);
    return {
      kind: 'program-parameter',
      pairs: [...text.matchAll(/^\| (-?\d+) \| (-?\d+) \|$/gmu)].map((row) => [
        Number(row[1]),
        Number(row[2]),
      ]),
      variable: first ? 's' : 't',
      fixed: Number(first?.[1] ?? second?.[1]),
      mode:
        task.subtype === 'parameter-min'
          ? 'min'
          : task.subtype === 'parameter-max'
            ? 'max'
            : 'any',
      yes: Number(match(/YES ровно (\d+) раз/u)[1]),
    };
  }
  if (task.taskNumber === 7) {
    const intro = match(
      /Доступ к файлу ([a-z.]+) на сервере ([a-z.]+) осуществляется по протоколу (FTP|HTTPS?)\./u,
    );
    return {
      kind: 'url',
      target: `${(intro[3] ?? '').toLowerCase()}://${intro[2] ?? ''}/${intro[1] ?? ''}`,
      fragments: [...text.matchAll(/^\| ([1-7]) \| `([^`]+)` \|$/gmu)].map(
        (row) => row[2] ?? '',
      ),
    };
  }
  if (task.taskNumber === 8) {
    const rows = [...text.matchAll(/^\| `[^`\n]+` \| (\d+) \|$/gmu)].map(
      (row) => Number(row[1]),
    );
    if (rows.length !== 3)
      throw new Error('Expected three conditional query counts');
    return {
      kind: 'search',
      union: rows[0] ?? 0,
      left: rows[1] ?? 0,
      ...(task.subtype === 'search-conditional-triple'
        ? { right: rows[2] ?? 0 }
        : { both: rows[2] ?? 0 }),
    };
  }
  if (task.taskNumber === 9) {
    if (task.figure?.kind !== 'directed-graph')
      throw new Error('A road diagram is required');
    return {
      kind: 'paths',
      end: match(/из A в ([A-H])\?/u)[1] ?? '',
      edges: task.figure.edges.map(({ from, to }) => [from, to]),
    };
  }
  if (task.taskNumber === 10)
    return {
      kind: 'numerals',
      terms: [...text.matchAll(/\\mathrm\{([0-9A-F]+)\}_\{(2|8|16)\}/gu)].map(
        (row) => [row[1] ?? '', Number(row[2])],
      ),
    };
  throw new Error('Not an implemented short exam format');
}
