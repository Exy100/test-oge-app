import { expect, test } from 'vitest';
import { testGenerator } from '../generator-suite';
import { confirmedShortGenerators } from '../../src/core/generators/exam/short-generators';
import {
  buildExamShortTask,
  examGenerator,
  problemSubtype,
  solveProblem,
  type ExamConstruction,
} from '../../src/core/generators/exam/short-tasks';
import { TaskInstanceSchema } from '../../src/core/schemas';
import { checkTaskAnswer } from '../../src/core/checker';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { shortFixtures } from '../fixtures/exam/short-answers';
import type { TaskInstance } from '../../src/core/types';

function arrangements(letters: string): string[] {
  const pending = [[letters, '']],
    values: string[] = [];
  for (let i = 0; i < pending.length; i++) {
    const [left = '', done = ''] = pending[i] ?? [];
    if (!left) values.push(done);
    else
      for (let j = 0; j < left.length; j++)
        pending.push([
          left.slice(0, j) + left.slice(j + 1),
          done + (left[j] ?? ''),
        ]);
  }
  return values;
}
function assertSubject(task: TaskInstance): void {
  const problem = parseGeneratedProblem(task),
    expected = solveParameters(problem);
  if (!expected) throw new Error('Independent subject oracle missing');
  const answer = task.answer;
  if (problem.kind === 'program-parameter' && problem.mode === 'any') {
    expect(answer.type === 'integer' && answer.acceptedRange).toBeTruthy();
    const cases = new Set([
      -1_000_000_000,
      1_000_000_000,
      ...Array.from({ length: 51 }, (_, i) => i - 25),
    ]);
    for (const a of cases) {
      const yes = problem.pairs.filter(([s, t]) =>
        problem.variable === 's'
          ? s > a || t > problem.fixed
          : s > problem.fixed || t > a,
      ).length;
      expect(checkTaskAnswer(task, String(a)).verdict).toBe(
        yes === problem.yes ? 'correct' : 'incorrect',
      );
    }
  } else if (answer.type === 'sequence') {
    const possible =
      problem.kind === 'decode' && problem.repeatedOnly
        ? expected.flatMap(arrangements)
        : expected;
    expect([answer.value, ...(answer.alternatives ?? [])].sort()).toEqual(
      possible.sort(),
    );
    for (const value of possible)
      expect(checkTaskAnswer(task, value).verdict).toBe('correct');
  } else {
    expect(['integer', 'word']).toContain(answer.type);
    if (answer.type === 'artifact') throw new Error('Expected a short answer');
    expect(expected).toEqual([answer.value]);
    if (answer.type === 'integer') expect(answer.acceptedRange).toBeUndefined();
  }
  for (const wrong of task.commonMistakes)
    expect(checkTaskAnswer(task, wrong.answer).verdict).not.toBe('correct');
}

for (const generator of confirmedShortGenerators) {
  testGenerator(generator, {
    assertUnique: assertSubject,
    assertQuality(task) {
      expect(task.statement.length).toBeLessThan(2200);
      expect(task.difficulty).toBeGreaterThanOrEqual(1);
      expect(task.difficulty).toBeLessThanOrEqual(3);
      if (task.taskNumber === 9) {
        expect(task.figure?.kind).toBe('directed-graph');
        if (task.figure?.kind === 'directed-graph')
          expect([7, 8]).toContain(task.figure.nodes.length);
      }
    },
    figures: (task) => (task.figure ? [task.figure] : []),
  });
  test(`${generator.id}: rejects altered answer policy, content, difficulty and source identity`, () => {
    const task = generator.generate('negative');
    for (const changed of [
      { ...task, id: 'wrong' },
      { ...task, seed: 'wrong' },
      { ...task, statement: 'wrong' },
      {
        ...task,
        difficulty: task.difficulty === 1 ? (2 as const) : (1 as const),
      },
      { ...task, answer: { type: 'integer' as const, value: '-99999' } },
      { ...task, figure: undefined },
    ]) {
      if (
        changed.figure === undefined &&
        task.figure === undefined &&
        JSON.stringify(changed) === JSON.stringify(task)
      )
        continue;
      expect(generator.verify(changed)).toBe(false);
    }
  });
}

for (const fixture of shortFixtures) {
  const p = fixture.parameters;
  if (
    p.kind === 'decode' ||
    p.kind === 'deleted-word' ||
    p.kind === 'logic' ||
    p.kind === 'roads' ||
    p.kind === 'executor' ||
    p.kind === 'program-parameter' ||
    p.kind === 'url' ||
    p.kind === 'search' ||
    p.kind === 'paths' ||
    p.kind === 'numerals'
  )
    test(`${fixture.id}: the real generator builder and checker accept the published solution`, () => {
      const construction: ExamConstruction = {
        problem: p,
        answer: solveProblem(p),
      };
      if (p.kind === 'decode') {
        const message = solveParameters({
          ...p,
          repeatedOnly: false,
        })?.[0];
        if (!message) throw new Error('Fixture decoding missing');
        construction.message = message;
      }
      const subtype = problemSubtype(p);
      expect(
        confirmedShortGenerators.some(
          (generator) => generator.subtype === subtype,
        ),
      ).toBe(true);
      const adapter = examGenerator(
        subtype,
        'Официальная проверочная фикстура',
        () => construction,
      );
      const task = TaskInstanceSchema.parse(
        buildExamShortTask(construction, fixture.id),
      );
      expect(adapter.verify(task)).toBe(true);
      for (const value of fixture.answers)
        expect(checkTaskAnswer(task, value).verdict).toBe('correct');
      assertSubject(task);
    });
}
test('difficulty changes with actual structural parameters rather than the seed label', () => {
  for (const generator of confirmedShortGenerators) {
    const values = new Set(
      Array.from(
        { length: 100 },
        (_, i) => generator.generate(`difficulty:${String(i)}`).difficulty,
      ),
    );
    expect(values.size, generator.id).toBeGreaterThan(1);
  }
});
