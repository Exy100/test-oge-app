import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import type { TaskInstance } from '../types';
import {
  learningGeneratorsForTask as generatorsForTask,
  getLearningGenerator as getGenerator,
} from './learning';

const labels = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'];
// Enumerate every ordered subset independently of the graph's edges.
const candidates: number[][] = [];
function subsets(prefix: number[], unused: number[]): void {
  candidates.push([0, ...prefix, 6]);
  for (const next of unused)
    subsets(
      [...prefix, next],
      unused.filter((value) => value !== next),
    );
}
subsets([], [1, 2, 3, 4, 5]);
function graphAnswer(task: TaskInstance): number {
  const rows = task.statement
    .split('\n')
    .filter((row) => /^\| [АБВГДЕЖ] \|/u.test(row));
  const graph = rows.map((row) =>
    row
      .split('|')
      .slice(2, -1)
      .map((value) => Number(value.trim())),
  );
  const required = /Обязательно посетить пункт ([БВГДЕ])/u.exec(
    task.statement,
  )?.[1];
  const excluded = /Пункт ([БВГДЕ]) посещать нельзя/u.exec(task.statement)?.[1];
  const length = /ровно (\d+) дорог/u.exec(task.statement)?.[1];
  const valid = candidates
    .filter((path) =>
      path.slice(1).every((to, i) => graph[path[i] ?? -1]?.[to] === 1),
    )
    .filter((path) => !required || path.includes(labels.indexOf(required)))
    .filter((path) => !excluded || !path.includes(labels.indexOf(excluded)))
    .filter((path) => !length || path.length === Number(length) + 1);
  return valid.length;
}
function decode(source: string, base: number): bigint {
  return BigInt(
    (({ 2: '0b', 8: '0o', 16: '0x' } as Record<number, string>)[base] ?? '') +
      source,
  );
}
function numeralAnswer(task: TaskInstance): string {
  if (task.subtype === 'radix-to-decimal') {
    const source = /Число `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
    const base = Number(/основанием (\d+)/u.exec(task.statement)?.[1]);
    return String(decode(source, base));
  }
  if (task.subtype === 'radix-from-decimal') {
    const value = BigInt(
      /Десятичное число (\d+)/u.exec(task.statement)?.[1] ?? '0',
    );
    const base = Number(/основанием (\d+)/u.exec(task.statement)?.[1]);
    if (task.answer.type !== 'sequence') throw new Error('Expected sequence');
    expect(task.answer.value).toMatch(/^[1-9][0-9]*$/u);
    expect(decode(task.answer.value, base)).toBe(value);
    // Repeated subtraction of place values, not native base conversion.
    let power = 1n;
    const radix = BigInt(base);
    let remainder = value;
    let result = '';
    while (power * radix <= value) power *= radix;
    while (power) {
      let digit = 0;
      while (remainder >= power) {
        remainder -= power;
        digit++;
      }
      result += String(digit);
      power /= radix;
    }
    return result;
  }
  if (task.subtype === 'binary-ones') {
    const values = /чисел (\d+) и (\d+)/u.exec(task.statement);
    let value = Number(values?.[1]) + Number(values?.[2]);
    let ones = 0;
    while (value > 0) {
      ones += value % 2;
      value = Math.floor(value / 2);
    }
    return String(ones);
  }
  const rows = [...task.statement.matchAll(/^\| `([^`]+)` \| (\d+) \|$/gmu)];
  const values = rows.map((row) => decode(row[1] ?? '', Number(row[2])));
  expect(new Set(values).size).toBe(3);
  return String(values.reduce((max, value) => (value > max ? value : max), 0n));
}
for (const generator of [...generatorsForTask(9), ...generatorsForTask(10)]) {
  testGenerator(generator, {
    assertUnique(task) {
      expect(task.answer).toMatchObject({
        value:
          task.taskNumber === 9
            ? String(graphAnswer(task))
            : numeralAnswer(task),
      });
    },
    assertQuality(task) {
      expect(task.solution.length).toBeGreaterThanOrEqual(3);
      expect(task.hints).toHaveLength(3);
      for (const mistake of task.commonMistakes)
        if (task.answer.type !== 'artifact')
          expect(
            generator.verify({
              ...task,
              answer: { ...task.answer, value: mistake.answer },
            }),
          ).toBe(false);
      if (task.taskNumber === 9) expect(graphAnswer(task)).toBeGreaterThan(0);
    },
  });
  test(`${generator.id}: rejects broken statements and answers`, () => {
    const task = generator.generate('invalid');
    expect(generator.verify({ ...task, statement: '' })).toBe(false);
    expect(
      generator.verify({ ...task, answer: { type: 'integer', value: '-1' } }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        answer: {
          type: 'sequence',
          value: '999999999999999',
          alphabet: 'digits',
          caseSensitive: true,
        },
      }),
    ).toBe(false);
  });
}

test('directed paths reject cycles, self-loops, missing rows and missing constraints', () => {
  for (const generator of generatorsForTask(9)) {
    const task = generator.generate('graph-invalid');
    const row = /^\| А \|.*$/mu.exec(task.statement)?.[0] ?? '';
    for (const statement of [
      task.statement.replace(row, ''),
      task.statement + '\n' + row,
      task.statement.replace('| А | 0 |', '| А | 1 |'),
      task.statement.replace(row, row.replace('1', '2')),
      task.statement.replace(
        /Дополнительных ограничений нет\.|Обязательно посетить пункт [БВГДЕ]\.|Пункт [БВГДЕ] посещать нельзя\.|Использовать ровно \d+ дорог\./u,
        '',
      ),
    ])
      expect(generator.verify({ ...task, statement })).toBe(false);
    const cycle = task.statement.replace(
      /^\| Ж \|.*$/mu,
      '| Ж | 1 | 0 | 0 | 0 | 0 | 0 | 0 |',
    );
    expect(generator.verify({ ...task, statement: cycle })).toBe(false);
  }
});

test('a graph with no roads has zero paths; exact length counts edges, not vertices', () => {
  const all = getGenerator('paths-all-v1');
  const task = all.generate('empty');
  const statement = task.statement.replace(
    /^(\| [АБВГДЕЖ] \|).*$/gmu,
    '$1 0 | 0 | 0 | 0 | 0 | 0 | 0 |',
  );
  expect(
    all.verify({ ...task, statement, answer: { type: 'integer', value: '0' } }),
  ).toBe(true);
  const exact = getGenerator('paths-length-v1');
  const original = exact.generate('chain');
  const chain = original.statement
    .replace(
      /^\| ([АБВГДЕЖ]) \|.*$/gmu,
      (_, label: string) =>
        `| ${label} | ${labels.map((__, to) => (to === labels.indexOf(label) + 1 ? '1' : '0')).join(' | ')} |`,
    )
    .replace(/ровно \d+ дорог/u, 'ровно 6 дорог');
  expect(
    exact.verify({
      ...original,
      statement: chain,
      answer: { type: 'integer', value: '1' },
    }),
  ).toBe(true);
  expect(
    exact.verify({
      ...original,
      statement: chain.replace('ровно 6', 'ровно 5'),
      answer: { type: 'integer', value: '0' },
    }),
  ).toBe(true);
});

test('radix boundaries: zero digits, powers of two, F and invalid digits', () => {
  const to = getGenerator('radix-to-decimal-v1');
  const task = to.generate('hex');
  for (const [source, base, value] of [
    ['FF', 16, '255'],
    ['100000000', 2, '256'],
    ['100', 8, '64'],
  ] as const) {
    const statement = `Число \`${source}\` записано в системе счисления с основанием ${String(base)}. Переведи его в десятичную систему. Ответ запиши целым числом.`;
    expect(
      to.verify({ ...task, statement, answer: { type: 'integer', value } }),
    ).toBe(true);
    expect(
      to.verify({
        ...task,
        statement: statement.replace(source, '1G'),
        answer: { type: 'integer', value },
      }),
    ).toBe(false);
    expect(
      to.verify({
        ...task,
        statement: statement.replace(source, '0' + source),
        answer: { type: 'integer', value },
      }),
    ).toBe(false);
  }
  const from = getGenerator('radix-from-decimal-v1');
  const original = from.generate('binary');
  const statement =
    'Десятичное число 256 переведи в систему счисления с основанием 2. Ответ запиши последовательностью цифр без пробелов и ведущих нулей.';
  for (const value of ['100000000', '0100000000', '100000002'])
    expect(
      from.verify({
        ...original,
        statement,
        answer: {
          type: 'sequence',
          value,
          alphabet: 'digits',
          caseSensitive: true,
        },
      }),
    ).toBe(value === '100000000');
  const ones = getGenerator('binary-ones-v1');
  const count = ones.generate('power');
  expect(
    ones.verify({
      ...count,
      statement:
        'Вычисли сумму десятичных чисел 255 и 1. Сколько цифр 1 содержит двоичная запись результата? Ответ запиши целым числом.',
      answer: { type: 'integer', value: '1' },
    }),
  ).toBe(true);
});
