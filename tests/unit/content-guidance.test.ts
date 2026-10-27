import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  buildExamShortTask,
  solveProblem,
} from '../../src/core/generators/exam/short-tasks';
import type { ExamShortProblem } from '../../src/core/generators/exam/short-problems';
import { checkTaskAnswer } from '../../src/core/checker';
import { renderRichText } from '../../src/core/rich-text/render';
import { programGuidance } from '../../src/core/generators/16/guidance';
import { referencePython } from '../../src/core/generators/16/programs';
import type { ProgramParameters } from '../../src/core/generators/16/problems';
import {
  sheetData,
  sheetFormulas,
  worksheetFormula,
} from '../../src/core/generators/14/exam-spreadsheets';

function task(problem: ExamShortProblem) {
  return buildExamShortTask(
    { problem, answer: solveProblem(problem) },
    'editorial-example',
  );
}

test('logic explains De Morgan and the actual bounds for the requested truth value', () => {
  const count = task({
    kind: 'logic',
    mode: 'count-true',
    predicate: ['not', ['or', ['ge', 9], ['not', ['odd']]]],
  });
  expect(count.solution[0]?.text).toContain('(X < 9 И X нечётное)');
  expect(count.solution[1]?.text).toContain('1, 3, 5, 7');
  expect(checkTaskAnswer(count, '4').verdict).toBe('correct');
  const first = task({
    kind: 'logic',
    mode: 'min-false',
    predicate: ['not', ['ge', 6]],
  });
  expect(first.solution[0]?.text).toContain('X ≥ 6');
  expect(first.solution[2]?.text).toContain('при X = 5 выражение истинно');
  expect(checkTaskAnswer(first, '6').verdict).toBe('correct');
});

test('road guidance reconstructs a real shortest route and checks its edge lengths', () => {
  const item = task({
    kind: 'roads',
    end: 'D',
    edges: [
      ['A', 'B', 2],
      ['B', 'D', 3],
      ['A', 'C', 7],
      ['C', 'D', 1],
      ['A', 'D', 10],
    ],
  });
  expect(item.solution[2]?.text).toContain('A → B → D');
  expect(item.solution[2]?.text).toContain('2 + 3 = 5');
  expect(item.hints.join(' ')).toContain('C–D: 1 км');
  expect(checkTaskAnswer(item, '5').verdict).toBe('correct');
});

test('executor guidance uses the current inverse operations and verifies the forward trace', () => {
  const item = task({
    kind: 'executor',
    start: 3,
    end: 13,
    add: 2,
    multiplier: 3,
    square: false,
    limit: 4,
  });
  expect(item.hints[0]).toContain('перед командой 2 стояло бы 11');
  expect(item.hints[1]).toContain('13 на 3');
  expect(item.solution[1]?.text).toContain('3 → 9 → 11 → 13');
});

test('parameter guidance separates unconditional YES and preserves the whole legal interval', () => {
  const item = task({
    kind: 'program-parameter',
    variable: 's',
    fixed: 5,
    mode: 'any',
    yes: 4,
    pairs: [
      [2, 8],
      [4, 0],
      [6, 0],
      [8, 0],
      [10, 0],
      [12, 0],
      [14, 0],
      [16, 0],
      [18, 0],
    ],
  });
  expect(item.solution[0]?.text).toContain('(2, 8)');
  expect(item.solution[0]?.text).toContain('Число этих YES: 1');
  expect(item.hints[1]).toContain('4, 6, 8, 10, 12, 14, 16, 18');
  expect(item.solution[2]?.text).toContain('A ≥ 12 и A ≤ 13');
  expect(checkTaskAnswer(item, '12').verdict).toBe('correct');
  expect(checkTaskAnswer(item, '13').verdict).toBe('correct');
  expect(checkTaskAnswer(item, '14').verdict).toBe('incorrect');
});

test('address and search hints refer to the actual server and actual table values', () => {
  const address = task({
    kind: 'url',
    target: 'https://school.example/map.pdf',
    fragments: ['https', ':', '//', 'school', '.example', '/map', '.pdf'],
  });
  expect(address.hints[1]).toContain('school.example');
  expect(address.hints[1]).toContain('map.pdf');
  for (const problem of [
    { kind: 'search', union: 100, left: 70, right: 55 },
    { kind: 'search', union: 100, left: 70, both: 20 },
  ] as const) {
    const item = task(problem);
    expect(item.hints[0]).toContain('100');
    expect(item.hints[1]).toContain('70');
    expect(item.solution[2]?.text).toContain('Проверка объединения');
  }
});

test('path and numeral explanations show the concrete additions and positional weights', () => {
  const paths = task({
    kind: 'paths',
    end: 'D',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
    ],
  });
  expect(paths.solution[2]?.text).toContain('1 + 1 = 2');
  expect(paths.hints[2]).toContain('B, C');
  const numerals = task({
    kind: 'numerals',
    terms: [
      ['101', 2],
      ['17', 8],
      ['A', 16],
    ],
  });
  expect(numerals.solution[0]?.text).toContain('1·2^2 + 0·2^1 + 1·2^0 = 5');
  expect(numerals.hints[1]).toContain('A = 10');
  expect(checkTaskAnswer(numerals, '30').verdict).toBe('correct');
  expect(renderRichText(numerals.statement)).toContain('<math');
  expect(renderRichText(numerals.statement)).not.toContain('math-error');
});

for (const [p, input, output, fragment] of [
  [
    { kind: 'python-filter', divisor: 5, threshold: -10 },
    '5\n-15\n-10\n0\n11\n20\n',
    '3 10',
    '-10, 0, 20',
  ],
  [{ kind: 'python-digits', divisor: 2 }, '10020\n', '4 2', 'Количество'],
  [
    { kind: 'python-pairs', divisor: 7 },
    '3\n-14\n-7\n0\n',
    '2 -7',
    'максимум -7',
  ],
  [{ kind: 'python-run', threshold: 4 }, '6\n5\n6\n1\n4\n4\n4\n', '3', '2, 3'],
] satisfies readonly (readonly [ProgramParameters, string, string, string])[]) {
  test(`${p.kind}: explanation agrees with actual Python execution on boundary examples`, () => {
    const actual = execFileSync('python3', ['-c', referencePython(p)], {
      input,
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    expect(actual).toBe(output);
    const guide = programGuidance(p, {
      id: 'review',
      label: 'Пример',
      input,
      output,
    });
    expect(guide.steps.join(' ')).toContain(
      fragment === 'Количество' ? 'количество 4' : fragment,
    );
    expect(guide.steps).toHaveLength(3);
    expect(guide.hints).toHaveLength(3);
  });
}

test('Calc instructions show worksheet notation while keeping exported OpenFormula intact', () => {
  for (const kind of [
    'sheet-count-range',
    'sheet-sum-mean',
    'sheet-count-mean',
  ] as const) {
    const formulas = sheetFormulas(sheetData(kind, 'editorial-example'));
    for (const formula of formulas) {
      expect(formula).toMatch(/^of:=/u);
      expect(worksheetFormula(formula)).toMatch(/^=/u);
      expect(worksheetFormula(formula)).not.toContain('of:');
      expect(worksheetFormula(formula)).not.toContain('[.');
    }
  }
  expect(worksheetFormula('of:=SUM([.A2:.A12])')).toBe('=SUM(A2:A12)');
});
