import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  traceProgram,
  type ProgramKind,
} from '../../src/lib/interactives/programs';
import { pythonFixtures } from '../fixtures/exam/practice';
import {
  robotKinds,
  robotCases,
  fieldFor,
} from '../../src/core/generators/15/fields';
import { referenceProgram } from '../../src/core/generators/15/robots';
import { RobotExecution, runRobot } from '../../src/core/robot';
import { Rng } from '../../src/core/rng';

it('independently executes 3000 bounded sequences in Python, including fractional means and zero sentinel', () => {
  const rng = new Rng('T7.11-sequences');
  const cases: {
    kind: ProgramKind;
    inputs: number[];
    code: string;
    output: string;
  }[] = [];
  for (const kind of [
    'filter',
    'pairs',
    'run',
    'average',
    'residue',
    'sentinel',
  ] as const) {
    for (let seed = 0; seed < 500; seed++) {
      const values = Array.from({ length: seed % 21 }, () =>
        rng.int(-999, 999),
      );
      const inputs =
        kind === 'sentinel'
          ? [...values.map((v) => Math.abs(v) + 1), 0]
          : [Math.max(1, values.length), ...(values.length ? values : [0])];
      const trace = traceProgram(kind, inputs);
      expect(trace.steps.length).toBeLessThanOrEqual(300);
      expect(
        trace.steps.every(
          (step) => step.line > 0 && step.line <= trace.lines.length,
        ),
      ).toBe(true);
      cases.push({
        kind,
        inputs,
        code: trace.lines.join('\n'),
        output: trace.output,
      });
    }
  }
  const actual = JSON.parse(
    execFileSync('python3', ['tests/fixtures/run-python-programs.py'], {
      input: JSON.stringify(cases),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }),
  ) as string[];
  expect(actual).toEqual(cases.map((item) => item.output));
});
it('matches the independently transcribed official cases for all three №16 formats', () => {
  const modes = {
    'positive-mean': 'average',
    'base7-sum': 'residue',
    'octal-sentinel': 'sentinel',
  } as const;
  for (const fixture of pythonFixtures)
    for (const item of fixture.cases)
      expect(
        traceProgram(
          modes[fixture.kind],
          item.input.trim().split(/\s+/u).map(Number),
        ).output,
      ).toBe(item.output.trim().replace(/\s+/gu, ' '));
});
it('handles first and last pair, negative maxima, inclusive thresholds and actual floating output', () => {
  expect(traceProgram('pairs', [1, -3]).output).toBe('0 0');
  expect(traceProgram('pairs', [3, -3, -3, -6]).output).toBe('2 -6');
  expect(traceProgram('pairs', [3, 1, 2, 1]).output).toBe('2 3');
  expect(traceProgram('run', [4, -1, 0, 0, 0]).output).toBe('3');
  expect(traceProgram('filter', [3, -3, 0, 3]).output).toBe('2 3');
  expect(traceProgram('average', [2, 7, 10]).output).toBe('8.5 2');
  expect(traceProgram('average', [2, 0, -1]).output).toBe('0 0');
  expect(traceProgram('sentinel', [0]).output).toBe('0');
  expect(traceProgram('sentinel', [509, 517, 4093, 4101, 0]).output).toBe('2');
});
it('rejects incomplete, excess, unsafe and unbounded sequences without execution', () => {
  for (const input of [
    [],
    [0],
    [2, 1],
    [1, 1, 2],
    [21, ...Array<number>(21).fill(1)],
    [1, NaN],
    [1, 1.5],
    [1, 100000],
  ])
    expect(() => traceProgram('filter', input)).toThrow();
  for (const input of [
    [],
    [1],
    [0, 1],
    [1, 0, 2],
    [1, -2, 0],
    [1.5, 0],
    Array<number>(22).fill(1),
  ])
    expect(() => traceProgram('sentinel', input)).toThrow();
});
it('all seven families pass real step and bounded batch execution without sharing state', () => {
  for (const kind of robotKinds) {
    const fields = robotCases(kind, 'lesson-robot-family').map(fieldFor);
    for (const field of fields) {
      const source = referenceProgram(kind),
        execution = new RobotExecution(source, field);
      while (['ready', 'running'].includes(execution.snapshot().status))
        execution.run(16);
      expect(execution.snapshot()).toEqual(runRobot(source, field));
      expect(execution.snapshot().success).toBe(true);
      expect(field.painted).toEqual([]);
    }
  }
});
