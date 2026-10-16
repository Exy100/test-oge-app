import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import type { TaskInstance } from '../types';
import {
  learningGeneratorsForTask as generatorsForTask,
  getLearningGenerator as getGenerator,
} from './learning';

function targetAddress(task: TaskInstance): string {
  if (task.subtype === 'url-move') {
    const old = /Исходный адрес: `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
    const directory =
      /перенесли в каталог `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
    const name = /переименовали в `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
    return old.split('/').slice(0, 3).join('/') + '/' + directory + '/' + name;
  }
  const protocol = /Протокол: `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
  const server = /Сервер: `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
  const name = /Файл: `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
  const directory = /Каталог `([^`]+)`/u.exec(task.statement)?.[1];
  return (
    protocol + '://' + server + '/' + (directory ? directory + '/' : '') + name
  );
}

function addressSolutions(task: TaskInstance): string[] {
  const rows = [...task.statement.matchAll(/^\| ([A-I]) \| `([^`]+)` \|$/gmu)];
  const target = targetAddress(task);
  const answers: string[] = [];
  function visit(offset: number, labels: string): void {
    if (offset === target.length) {
      answers.push(labels);
      return;
    }
    for (const row of rows) {
      const label = row[1] ?? '';
      const fragment = row[2] ?? '';
      if (
        fragment &&
        !labels.includes(label) &&
        target.startsWith(fragment, offset)
      )
        visit(offset + fragment.length, labels + label);
    }
  }
  visit(0, '');
  return answers;
}

/** Solve the observed set counts as a linear system, without producer formulas. */
function searchAnswer(task: TaskInstance): number {
  const masks =
    task.subtype === 'search-three'
      ? [1, 2, 3, 4, 5, 6, 7]
      : task.subtype === 'search-difference'
        ? [1, 3]
        : [1, 2, 3];
  function contains(query: string, mask: number): boolean {
    const present = (word: string) =>
      (mask & (({ A: 1, B: 2, C: 4 } as Record<string, number>)[word] ?? 0)) !==
      0;
    return query.includes(' ИЛИ ')
      ? query.split(' ИЛИ ').some(present)
      : query.split(' И ').every(present);
  }
  const observations = [
    ...task.statement.matchAll(
      /^\| ([ABC](?: И(?:ЛИ)? [ABC])*) \| (\d+) \|$/gmu,
    ),
  ];
  const matrix = observations.map((row) => [
    ...masks.map((mask) => Number(contains(row[1] ?? '', mask))),
    Number(row[2]),
  ]);
  expect(matrix).toHaveLength(masks.length);
  for (let column = 0; column < masks.length; column++) {
    const pivot = matrix.findIndex(
      (row, index) => index >= column && row[column] !== 0,
    );
    expect(pivot).toBeGreaterThanOrEqual(column);
    const current = matrix[column];
    const selected = matrix[pivot];
    if (!current || !selected) throw new Error('Missing pivot');
    matrix[column] = selected;
    matrix[pivot] = current;
    const scale = selected[column] ?? 0;
    matrix[column] = selected.map((value) => value / scale);
    for (let row = 0; row < matrix.length; row++)
      if (row !== column) {
        const values = matrix[row];
        const normalized = matrix[column];
        if (!values || !normalized) throw new Error('Missing equation');
        const factor = values[column] ?? 0;
        matrix[row] = values.map(
          (value, index) => value - factor * (normalized[index] ?? 0),
        );
      }
  }
  const counts = matrix.map((row) => row.at(-1) ?? NaN);
  expect(counts.every((value) => Number.isInteger(value) && value >= 0)).toBe(
    true,
  );
  // Materialize distinct pages, then evaluate membership instead of count formulas.
  const pages = masks.flatMap((mask, i) =>
    Array.from({ length: counts[i] ?? 0 }, () => mask),
  );
  for (const row of observations)
    expect(pages.filter((mask) => contains(row[1] ?? '', mask))).toHaveLength(
      Number(row[2]),
    );
  return pages.filter((mask) =>
    task.subtype === 'search-difference'
      ? (mask & 1) !== 0 && (mask & 2) === 0
      : contains(
          task.subtype === 'search-intersection'
            ? 'A И B'
            : task.subtype === 'search-three'
              ? 'A ИЛИ B ИЛИ C'
              : 'A ИЛИ B',
          mask,
        ),
  ).length;
}

for (const generator of [...generatorsForTask(7), ...generatorsForTask(8)]) {
  testGenerator(generator, {
    assertUnique(task) {
      const answers =
        task.taskNumber === 7
          ? addressSolutions(task)
          : [String(searchAnswer(task))];
      expect(answers).toHaveLength(1);
      expect(task.answer).toMatchObject({ value: answers[0] });
    },
    assertQuality(task) {
      expect(task.hints).toHaveLength(3);
      expect(task.solution.length).toBeGreaterThanOrEqual(3);
      for (const mistake of task.commonMistakes)
        if (task.answer.type !== 'artifact')
          expect(
            generator.verify({
              ...task,
              answer: { ...task.answer, value: mistake.answer },
            }),
          ).toBe(false);
      if (task.taskNumber === 7)
        expect(targetAddress(task)).toMatch(
          /^https?:\/\/[a-z]+\.example\/(?:[a-z]+\/)?[a-z]+\.[a-z]+$/u,
        );
    },
  });
  test(`${generator.id}: rejects malformed tasks`, () => {
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
          value: 'AAAAAAA',
          alphabet: 'latin',
          caseSensitive: true,
        },
      }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        statement: task.statement.replace(/^\| A \|.*\n/mu, ''),
      }),
    ).toBe(false);
    const row = /^\| A \|.*$/mu.exec(task.statement)?.[0] ?? '';
    expect(
      generator.verify({ ...task, statement: task.statement + '\n' + row }),
    ).toBe(false);
  });
}

test('addresses reject wrong paths, normalized URLs and invalid fragment labels', () => {
  for (const generator of generatorsForTask(7)) {
    const task = generator.generate('address-negative');
    for (const statement of [
      task.statement.replace('.example', '.invalid'),
      task.statement.replace('| A |', '| Z |'),
      task.statement.replace('`://`', '`:/`'),
      task.statement.replace('`://`', '`://user@`'),
    ])
      expect(generator.verify({ ...task, statement })).toBe(false);
    if (task.answer.type !== 'sequence') throw new Error('Expected sequence');
    expect(
      generator.verify({
        ...task,
        answer: { ...task.answer, value: task.answer.value.toLowerCase() },
      }),
    ).toBe(false);
    expect(
      generator.verify({
        ...task,
        statement: task.statement.replace(
          new RegExp(
            '^(\\| ' + (task.answer.value[4] ?? '') + ' \\| `)([^`]+)(` \\|)$',
            'mu',
          ),
          '$1$2/../$3',
        ),
      }),
    ).toBe(false);
  }
});

test('set verifier accepts empty intersections and rejects impossible regions', () => {
  const cases: [string, string, string][] = [
    ['search-union-v1', '| A | 10 |\n| B | 20 |\n| A И B | 0 |', '30'],
    ['search-intersection-v1', '| A | 10 |\n| B | 20 |\n| A ИЛИ B | 30 |', '0'],
    ['search-difference-v1', '| A | 10 |\n| A И B | 10 |', '0'],
    [
      'search-three-v1',
      '| A | 10 |\n| B | 10 |\n| C | 10 |\n| A И B | 10 |\n| A И C | 10 |\n| B И C | 10 |\n| A И B И C | 10 |',
      '10',
    ],
  ];
  for (const [id, table, value] of cases) {
    const generator = getGenerator(id);
    const task = generator.generate('sets');
    const statement = task.statement
      .replace(/^\| [ABC].*\|$/gmu, '')
      .replace('| --- | --- |', '| --- | --- |\n' + table);
    const changed = {
      ...task,
      statement,
      answer: { type: 'integer' as const, value },
    };
    expect(generator.verify(changed)).toBe(true);
    expect(searchAnswer(changed)).toBe(Number(value));
    expect(
      generator.verify({
        ...changed,
        statement: statement.replace('| A | 10 |', '| A | 1 |'),
      }),
    ).toBe(false);
    expect(
      generator.verify({
        ...changed,
        statement: statement.replace('| A | 10 |', '| A | 100001 |'),
      }),
    ).toBe(false);
  }
});
