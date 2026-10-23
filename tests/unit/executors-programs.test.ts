import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  checkExecutor,
  executorLabs,
  executorTrace,
} from '../../src/lib/interactives/executors';
import {
  parameterLab,
  traceProgram,
  type ProgramKind,
} from '../../src/lib/interactives/programs';
import {
  parameterInterval,
  parameterYes,
} from '../../src/core/generators/exam/short-problems';
import { shortFixtures } from '../fixtures/exam/short-answers';

function programs(length: number): string[] {
  return length === 0
    ? ['']
    : programs(length - 1).flatMap((prefix) => [prefix + '1', prefix + '2']);
}
describe('fixed executor accepts every valid program', () => {
  for (const [key, { problem }] of Object.entries(executorLabs)) {
    it(`${key}: all 62 programs are checked by independent forward arithmetic`, () => {
      for (let length = 1; length <= 5; length++)
        for (const program of programs(length)) {
          const states = [BigInt(problem.start)];
          for (const command of program) {
            const value = states.at(-1) ?? 0n;
            states.push(
              command === '2'
                ? value + BigInt(problem.add)
                : 'square' in problem
                  ? value ** 2n
                  : value * BigInt(problem.multiplier),
            );
          }
          expect(executorTrace(problem, program)).toEqual(states);
          expect(checkExecutor(problem, program)).toBe(
            states.at(-1) === BigInt(problem.end),
          );
        }
      expect(checkExecutor(problem, '')).toBe(false);
    });
  }
  it('accepts different correct lengths and squares, rejects invalid commands and limits', () => {
    for (const answer of ['11', '21', '122', '222'])
      expect(checkExecutor(executorLabs.multiply.problem, answer)).toBe(true);
    for (const answer of ['11', '21'])
      expect(checkExecutor(executorLabs.square.problem, answer)).toBe(true);
    for (const program of ['0', '12 1', '111111', '1,2', '３', '-1'])
      expect(() =>
        executorTrace(executorLabs.multiply.problem, program),
      ).toThrow();
    expect(() =>
      executorTrace({ ...executorLabs.multiply.problem, limit: 6 }, '1'),
    ).toThrow();
  });
  it('also traces the independently solved official executor fixtures', () => {
    const fixtures = shortFixtures.filter(
      (f) => f.parameters.kind === 'executor',
    );
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    for (const fixture of fixtures)
      if (fixture.parameters.kind === 'executor')
        for (const answer of fixture.answers)
          expect(checkExecutor(fixture.parameters, answer)).toBe(true);
  });
});

describe('program trace agrees with actual Python 3', () => {
  it('matches every line, variable snapshot and output for assignments, branches and both loops', () => {
    const cases: { kind: ProgramKind; input: number[]; a: number }[] = [];
    for (let x = -10; x <= 10; x++)
      for (let y = -3; y <= 3; y++)
        cases.push({ kind: 'assign', input: [x, y], a: 2 });
    for (let a = -15; a <= 15; a++)
      for (const pair of parameterLab.pairs)
        cases.push({ kind: 'branch', input: [...pair], a });
    for (let n = 0; n <= 20; n++) cases.push({ kind: 'for', input: [n], a: 2 });
    for (const n of [0, 1, 9, 10, 100, 1000, 10203, 99999, 50304])
      cases.push({ kind: 'while', input: [n], a: 2 });
    const traces = cases.map((c) => traceProgram(c.kind, c.input, c.a));
    const python = `import json,sys
cases=json.load(sys.stdin)
results=[]
for case in cases:
    data=iter(case['input'])
    output=[]
    env={'__builtins__':{'int':int,'range':range,'input':lambda:next(data),'print':lambda x:output.append(str(x))}}
    steps=[]
    previous=[None]
    def trace(frame,event,arg):
        if frame.f_code.co_filename=='<lesson>' and event in ('line','return'):
            if previous[0] is not None:
                steps.append({'line':previous[0],'values':{k:v for k,v in frame.f_globals.items() if not k.startswith('__')},'output':'\\n'.join(output)})
            previous[0]=frame.f_lineno if event=='line' else None
        return trace
    sys.settrace(trace)
    exec(compile(case['code'],'<lesson>','exec'),env)
    sys.settrace(None)
    results.append(steps)
json.dump(results,sys.stdout)`;
    const actual = JSON.parse(
      execFileSync('python3', ['-c', python], {
        input: JSON.stringify(
          cases.map((c, index) => ({
            ...c,
            code: traces[index]?.lines.join('\n'),
          })),
        ),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      }),
    ) as unknown[];
    for (const [index, trace] of traces.entries())
      expect(
        trace.steps.map(({ line, values, output }) => ({
          line,
          values,
          output,
        })),
        JSON.stringify(cases[index]),
      ).toEqual(actual[index]);
  });
  it('counts nine independent runs and accepts every integer on the required plateau', () => {
    expect(parameterInterval(parameterLab)).toEqual({ min: 2, max: 4 });
    for (let a = -20; a <= 20; a++) {
      const outputs = parameterLab.pairs.map(
        (pair) => traceProgram('branch', pair, a).output,
      );
      const yes = outputs.filter((value) => value === 'YES').length;
      expect(yes).toBe(parameterYes(parameterLab, a));
      expect(yes === parameterLab.yes).toBe(a >= 2 && a <= 4);
    }
  });
  it('rejects out of bounds, fractional, missing and excess inputs; handles zero iterations', () => {
    for (const [kind, input] of [
      ['assign', [1]],
      ['assign', [1, 2, 3]],
      ['for', [-1]],
      ['for', [21]],
      ['while', [-1]],
      ['while', [100000]],
      ['assign', [NaN, 2]],
      ['branch', [1.5, 2]],
    ] as const)
      expect(() => traceProgram(kind, input)).toThrow();
    expect(() => traceProgram('branch', [1, 2], 1001)).toThrow();
    for (const kind of ['for', 'while'] as const) {
      const trace = traceProgram(kind, [0]);
      expect(trace.output).toBe('0');
      expect(
        trace.steps.some(
          (step) => 'digit' in step.values || 'i' in step.values,
        ),
      ).toBe(false);
    }
    const first = traceProgram('assign', [6, 2]).steps[0];
    expect(first?.values).toEqual({ x: 6 });
    expect(traceProgram('assign', [1, 1]).steps[0]?.values).toEqual({ x: 1 });
    expect(first?.values).toEqual({ x: 6 });
  });
});
