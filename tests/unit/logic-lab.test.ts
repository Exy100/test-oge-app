import { expect, test } from 'vitest';
import {
  logicAnswer,
  logicDomain,
  logicProblem,
  logicSolutions,
  logicTrace,
  logicValue,
  negateLogic,
  type LogicNode,
} from '../../src/lib/interactives/logic-lab';
test('boundaries and the requested false result change the answer', () => {
  expect(logicSolutions(logicProblem(0))).toEqual([5, 6, 7, 8]);
  expect(logicAnswer(logicProblem(0))).toBe(4);
  expect(logicSolutions(logicProblem(1))).toEqual([5, 6, 7, 8, 9]);
  expect(logicAnswer(logicProblem(1))).toBe(5);
  expect(logicAnswer(logicProblem(2))).toBe(9);
  expect(logicSolutions(logicProblem(3))).toEqual([1, 2, 3, 4, 10, 11, 12]);
});
test('generated tasks agree with independent interval predicates', () => {
  for (let variant = 0; variant < 300; variant++) {
    const p = logicProblem(variant);
    const a = 5 + ((Math.floor(variant / 4) * 3) % 9);
    const b = a + 4 + (Math.floor(variant / 8) % 3);
    const expected = logicDomain(p).filter((x) =>
      variant % 4 === 0
        ? x >= a && x < b
        : variant % 4 === 3
          ? x < a || x > b
          : x >= a && x <= b,
    );
    expect(logicSolutions(p)).toEqual(expected);
    expect(logicAnswer(p)).toBe(
      p.goal === 'count'
        ? expected.length
        : p.goal === 'min'
          ? expected[0]
          : expected.at(-1),
    );
    for (const x of logicDomain(p)) {
      expect(logicValue(negateLogic(p.expression), x)).toBe(
        !logicValue(p.expression, x),
      );
      expect(logicTrace(p.expression, x).at(-1)?.result).toBe(
        logicValue(p.expression, x),
      );
    }
  }
});
test('negation includes equality and inclusive OR accepts two true operands', () => {
  const atom: LogicNode = { kind: 'compare', op: '<', value: 5 };
  expect(logicValue(negateLogic(atom), 5)).toBe(true);
  const both: LogicNode = { kind: 'or', left: atom, right: atom };
  expect(logicValue(both, 4)).toBe(true);
  expect(logicValue(negateLogic(both), 4)).toBe(false);
});
