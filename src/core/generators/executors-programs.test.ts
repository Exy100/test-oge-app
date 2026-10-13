import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import type { TaskInstance } from '../types';
import { generatorsForTask } from './index';

function programs(task: TaskInstance): string[] {
  const numeric =
    /Начальное число: (\d+).*прибавить (\d+).*умножить на (\d+).*Цель: (\d+)/u.exec(
      task.statement,
    );
  const string = /Начальная строка: ([А-ЯЁ]+).*Цель: ([А-ЯЁ]+)/u.exec(
    task.statement,
  );
  const pattern = /Программа: `([12?]+)`/u.exec(task.statement)?.[1];
  const shortest = task.subtype === 'executor-shortest';
  const size =
    pattern?.length ?? Number(/ровно из (\d+)/u.exec(task.statement)?.[1]);
  for (
    let length = shortest ? 0 : size;
    length <= (shortest ? 5 : size);
    length++
  ) {
    const answers: string[] = [];
    for (let mask = 0; mask < 2 ** length; mask++) {
      const digits = length
        ? mask
            .toString(2)
            .padStart(length, '0')
            .replaceAll('1', '2')
            .replaceAll('0', '1')
        : '';
      if (
        pattern &&
        Array.from(pattern).some((c, i) => c !== '?' && c !== digits[i])
      )
        continue;
      let number = Number(numeric?.[1]);
      const letters = Array.from(string?.[1] ?? '');
      for (const digit of digits) {
        if (numeric)
          number =
            digit === '1'
              ? number + Number(numeric[2])
              : number * Number(numeric[3]);
        else if (digit === '1') {
          const a = letters.shift() ?? '';
          const b = letters.shift() ?? '';
          letters.unshift(b, a);
        } else letters.push(letters.shift() ?? '');
      }
      if (
        numeric
          ? number === Number(numeric[4])
          : letters.join('') === string?.[2]
      )
        answers.push(
          pattern
            ? Array.from(digits)
                .filter((_, i) => pattern[i] === '?')
                .join('')
            : digits,
        );
    }
    if (answers.length || !shortest) return answers;
  }
  return [];
}

function expectedProgram(task: TaskInstance): number {
  const input =
    /Ввод: `([\d ]+)`/u.exec(task.statement)?.[1]?.split(' ').map(Number) ?? [];
  if (task.subtype === 'program-assign')
    return (input[0] ?? 0) ** 2 + (input[0] ?? 0) * (input[1] ?? 0);
  if (task.subtype === 'program-for') {
    const d = Number(/i % (\d+)/u.exec(task.statement)?.[1]);
    const count = Math.floor((input[0] ?? 0) / d);
    return (d * count * (count + 1)) / 2;
  }
  if (task.subtype === 'program-while') {
    const threshold = Number(/digit >= (\d+)/u.exec(task.statement)?.[1]);
    return Array.from(String(input[0]))
      .map(Number)
      .reduce((sum, d) => sum + (d >= threshold ? d : 0), 0);
  }
  const condition = /s > (\d+) (and|or) t < (\d+)/u.exec(task.statement);
  return [
    ...task.statement.matchAll(/^\| \d+ \| (\d+) \| (\d+) \|$/gmu),
  ].filter((row) => {
    const truthCount =
      Number(Number(row[1]) > Number(condition?.[1])) +
      Number(Number(row[2]) < Number(condition?.[3]));
    return truthCount >= (condition?.[2] === 'and' ? 2 : 1);
  }).length;
}

for (const generator of [...generatorsForTask(5), ...generatorsForTask(6)]) {
  testGenerator(generator, {
    assertUnique(task) {
      const answers =
        task.taskNumber === 5
          ? programs(task)
          : [String(expectedProgram(task))];
      expect(answers).toHaveLength(1);
      expect(task.answer).toMatchObject({ value: answers[0] });
    },
    assertQuality(task) {
      expect(task.solution.length).toBeGreaterThanOrEqual(3);
      expect(task.hints).toHaveLength(3);
      for (const mistake of task.commonMistakes) {
        if (task.answer.type !== 'artifact')
          expect(
            generator.verify({
              ...task,
              answer: { ...task.answer, value: mistake.answer },
            }),
          ).toBe(false);
      }
    },
  });
  test(`${generator.id}: malformed statements and answers are rejected`, () => {
    const task = generator.generate('negative');
    expect(generator.verify({ ...task, statement: '' })).toBe(false);
    expect(
      generator.verify({ ...task, answer: { type: 'integer', value: '-999' } }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        answer: {
          type: 'sequence',
          value: '3',
          alphabet: 'digits',
          caseSensitive: true,
        },
      }),
    ).toBe(false);
    const statement =
      task.taskNumber === 5
        ? task.statement.replace('Команда 1', 'Команда 3')
        : task.statement.replace('print(', 'unknown(');
    expect(generator.verify({ ...task, statement })).toBe(false);
  });
}

test('Python 3 executes 500 seeds of every program subtype independently', () => {
  const cases: { code: string; inputs: number[] }[] = [];
  const ranges: {
    start: number;
    count: number;
    answer: string;
    branch: boolean;
  }[] = [];
  for (const generator of generatorsForTask(6))
    for (let seed = 0; seed < 500; seed++) {
      const task = generator.generate(`python-${String(seed)}`);
      const code = /```python\n([^]*?)\n```/u.exec(task.statement)?.[1] ?? '';
      const branch = task.subtype === 'program-branch';
      const inputs = branch
        ? [...task.statement.matchAll(/^\| \d+ \| (\d+) \| (\d+) \|$/gmu)].map(
            (row) => [Number(row[1]), Number(row[2])],
          )
        : [
            (/Ввод: `([\d ]+)`/u.exec(task.statement)?.[1] ?? '')
              .split(' ')
              .map(Number),
          ];
      if (task.answer.type !== 'integer') throw new Error('Expected integer');
      ranges.push({
        start: cases.length,
        count: inputs.length,
        answer: task.answer.value,
        branch,
      });
      for (const input of inputs) cases.push({ code, inputs: input });
    }
  const result = spawnSync(
    'python3',
    ['-I', 'tests/fixtures/run-python-programs.py'],
    {
      input: JSON.stringify(cases),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const outputs = JSON.parse(result.stdout) as string[];
  expect(outputs).toHaveLength(cases.length);
  for (const range of ranges) {
    const values = outputs.slice(range.start, range.start + range.count);
    if (range.branch)
      expect(values.every((value) => value === 'ДА' || value === 'НЕТ')).toBe(
        true,
      );
    expect(
      range.branch
        ? String(values.filter((value) => value === 'ДА').length)
        : values[0],
    ).toBe(range.answer);
  }
}, 30000);

test('executor verifier rejects ambiguity, unreachable targets and invalid constraints', () => {
  const fixed = generatorsForTask(5)[0];
  const shortest = generatorsForTask(5)[1];
  const missing = generatorsForTask(5)[2];
  const strings = generatorsForTask(5)[3];
  if (!fixed || !shortest || !missing || !strings)
    throw new Error('Missing generators');
  const ambiguous = {
    ...fixed.generate('boundary'),
    statement:
      'Начальное число: 3. Команда 1: прибавить 3. Команда 2: умножить на 2. Цель: 24. Составь программу ровно из 3 команд.',
    answer: {
      type: 'sequence' as const,
      value: '222',
      alphabet: 'digits' as const,
      caseSensitive: true,
    },
  };
  expect(fixed.verify(ambiguous)).toBe(false);
  for (const generator of [fixed, shortest, missing]) {
    const task = generator.generate('boundary');
    for (const statement of [
      task.statement.replace(/Цель: \d+/u, 'Цель: 9999'),
      task.statement.replace(/прибавить \d+/u, 'прибавить 0'),
      task.statement.replace(/умножить на \d+/u, 'умножить на 1'),
      task.statement.replace(/Начальное число: \d+/u, 'Начальное число: 0'),
      task.statement.replace(/Цель: \d+/u, 'Цель: 10001'),
    ])
      expect(generator.verify({ ...task, statement })).toBe(false);
  }
  const incomplete = missing.generate('boundary');
  expect(
    missing.verify({
      ...incomplete,
      statement: incomplete.statement.replace('?', '1'),
    }),
  ).toBe(false);
  const short = shortest.generate('boundary');
  expect(
    shortest.verify({
      ...short,
      statement: short.statement.replace('кратчайшую', 'любую'),
    }),
  ).toBe(false);
  const letters = strings.generate('boundary');
  expect(
    strings.verify({
      ...letters,
      statement: letters.statement.replace(
        /Начальная строка: [А-ЯЁ]+/u,
        'Начальная строка: ААБВ',
      ),
    }),
  ).toBe(false);
});

test('program verifier rejects changed code, missing inputs and broken run tables', () => {
  for (const generator of generatorsForTask(6)) {
    const task = generator.generate('boundary');
    for (const statement of [
      task.statement.replace('```python', '```text'),
      task.statement
        .replace(/Ввод: `[^`]+`/u, 'Ввод: `0`')
        .replace('| 1 |', '| 11 |'),
      task.statement
        .replace(/Ввод: `[^`]+`/u, 'Ввод: `100000`')
        .replace(/^\| 10 \|.*$/mu, ''),
    ])
      expect(generator.verify({ ...task, statement })).toBe(false);
  }
});
