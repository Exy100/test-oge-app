import { expect, test } from 'vitest';
import { shortFixtures } from '../fixtures/exam/short-answers';
import { solveShort } from '../fixtures/exam/solve-short';
import { checkAnswer } from '../../src/core/checker';
import { CorrectAnswerSchema } from '../../src/core/schemas';
import {
  decodeSolutions,
  executeCommands,
  executorSolutions,
  parameterInterval,
  pathCount,
  queryAnswer,
  numeralSum,
  urlOrders,
  deletedWords,
  logicAnswer,
  roadDistances,
} from '../../src/core/generators/exam/short-problems';

for (const fixture of shortFixtures) {
  const p = fixture.parameters;
  if (p.kind === 'deleted-word')
    test(`${fixture.id}: deleted word including comma, space and actual encoding width`, () => {
      expect(deletedWords(p)).toEqual(fixture.answers);
      expect(deletedWords(p)).toEqual(solveShort(fixture));
    });
  if (p.kind === 'logic')
    test(`${fixture.id}: natural solutions including nested negation and parity`, () => {
      expect([String(logicAnswer(p))]).toEqual(fixture.answers);
      expect([String(logicAnswer(p))]).toEqual(solveShort(fixture));
    });
  if (p.kind === 'roads')
    test(`${fixture.id}: weighted undirected table by Dijkstra and exhaustive routes`, () => {
      expect([String(roadDistances(p).get(p.end))]).toEqual(fixture.answers);
      expect([String(roadDistances(p).get(p.end))]).toEqual(
        solveShort(fixture),
      );
    });
  if (p.kind === 'executor')
    test(`${fixture.id}: reverse solver accepts every valid program, not just the printed example`, () => {
      const programs = executorSolutions(p);
      expect([...programs].sort()).toEqual(
        [...(solveShort(fixture) ?? [])].sort(),
      );
      for (const reference of fixture.answers)
        expect(programs).toContain(reference);
      const first = programs[0];
      if (!first) throw new Error('No executor solution');
      const answer = CorrectAnswerSchema.parse({
        type: 'sequence',
        value: first,
        alphabet: 'digits',
        caseSensitive: true,
        ...(programs.length > 1 ? { alternatives: programs.slice(1) } : {}),
      });
      for (const program of programs) {
        expect(executeCommands(p, program)).toBe(BigInt(p.end));
        expect(checkAnswer(answer, program).verdict).toBe('correct');
      }
      for (let n = 1; n < 64; n++) {
        const program = n.toString(2).slice(1).replaceAll('0', '2');
        if (!program) continue;
        expect(checkAnswer(answer, program).verdict).toBe(
          executeCommands(p, program) === BigInt(p.end)
            ? 'correct'
            : 'incorrect',
        );
      }
    });
  if (p.kind === 'program-parameter')
    test(`${fixture.id}: exact finite or one-sided parameter plateau`, () => {
      const interval = parameterInterval(p);
      const value =
        p.mode === 'min'
          ? interval.min
          : p.mode === 'max'
            ? interval.max
            : Number(fixture.answers[0]);
      expect(value).toBe(Number(fixture.answers[0]));
      const answer = CorrectAnswerSchema.parse({
        type: 'integer',
        value: String(value),
        ...(p.mode === 'any'
          ? {
              acceptedRange: Object.fromEntries(
                Object.entries(interval).map(([key, number]) => [
                  key,
                  String(number),
                ]),
              ),
            }
          : {}),
      });
      for (let a = -30; a <= 30; a++) {
        const yes = p.pairs.reduce(
          (sum, [s, t]) =>
            sum +
            Number(
              p.variable === 's' ? s > a || t > p.fixed : s > p.fixed || t > a,
            ),
          0,
        );
        expect(checkAnswer(answer, String(a)).verdict).toBe(
          (p.mode === 'any' ? yes === p.yes : a === value)
            ? 'correct'
            : 'incorrect',
        );
      }
      if (p.mode === 'any')
        for (const reference of solveShort(fixture) ?? [])
          expect(checkAnswer(answer, reference).verdict).toBe('correct');
    });
  if (p.kind === 'decode')
    test(`${fixture.id}: whole-signal decoding without prefix assumptions`, () => {
      expect([...decodeSolutions(p)].sort()).toEqual(
        [...(solveShort(fixture) ?? [])].sort(),
      );
    });
  if (p.kind === 'url')
    test(`${fixture.id}: original seven digital fragment labels`, () => {
      const orders = urlOrders(p);
      expect(orders).toEqual(solveShort(fixture));
      for (const order of orders)
        expect(
          Array.from(order, (label) => p.fragments[Number(label) - 1]).join(''),
        ).toBe(p.target);
    });
  if (p.kind === 'search')
    test(`${fixture.id}: conditional union / triple intersection`, () => {
      expect(String(queryAnswer(p))).toBe(fixture.answers[0]);
    });
  if (p.kind === 'paths')
    test(`${fixture.id}: topological path count on the actual seven/eight-node graph`, () => {
      expect(String(pathCount(p))).toBe(fixture.answers[0]);
    });
  if (p.kind === 'numerals')
    test(`${fixture.id}: exact sum in the published bases`, () => {
      expect(String(numeralSum(p))).toBe(fixture.answers[0]);
    });
}

test('one-sided answer bounds remain exact far beyond JS safe integers', () => {
  for (const [range, yes, no] of [
    [{ min: '13' }, '99999999999999999999999999999999', '12'],
    [{ max: '-13' }, '-99999999999999999999999999999999', '-12'],
  ] as const) {
    const answer = CorrectAnswerSchema.parse({
      type: 'integer',
      value: 'min' in range ? range.min : range.max,
      acceptedRange: range,
    });
    expect(checkAnswer(answer, yes).verdict).toBe('correct');
    expect(checkAnswer(answer, no).verdict).toBe('incorrect');
  }
  expect(
    CorrectAnswerSchema.safeParse({
      type: 'integer',
      value: '0',
      acceptedRange: {},
    }).success,
  ).toBe(false);
  expect(() =>
    checkAnswer({ type: 'integer', value: '0', acceptedRange: {} }, '0'),
  ).toThrow(TypeError);
});
test('invalid and ambiguous problem data do not silently produce an answer', () => {
  expect(() =>
    deletedWords({
      kind: 'deleted-word',
      bits: 7,
      bytes: 10,
      words: ['дуб', 'клён', 'сосна', 'берёза'],
    }),
  ).toThrow();
  expect(() =>
    deletedWords({
      kind: 'deleted-word',
      bits: 16,
      bytes: 10,
      words: ['дуб', 'дуб', 'сосна', 'берёза'],
    }),
  ).toThrow();
  expect(() =>
    logicAnswer({ kind: 'logic', predicate: ['gt', 3], mode: 'count-true' }),
  ).toThrow(/бесконечно/u);
  expect(() =>
    logicAnswer({ kind: 'logic', predicate: ['odd'], mode: 'count-true' }),
  ).toThrow(/бесконечно/u);
  expect(() =>
    logicAnswer({
      kind: 'logic',
      predicate: ['or', ['gt', 1], ['eq', 1]],
      mode: 'min-false',
    }),
  ).toThrow(/Нет натурального/u);
  expect(() =>
    logicAnswer({ kind: 'logic', predicate: ['gt', 1001], mode: 'min-false' }),
  ).toThrow();
  expect(() =>
    roadDistances({
      kind: 'roads',
      edges: [
        ['A', 'B', 2],
        ['B', 'A', 2],
      ],
      end: 'B',
    }),
  ).toThrow();
  expect(() =>
    roadDistances({ kind: 'roads', edges: [['A', 'B', 0]], end: 'B' }),
  ).toThrow();
  expect(() =>
    roadDistances({ kind: 'roads', edges: [['A', 'B', 2]], end: 'C' }),
  ).toThrow();
  expect(() =>
    executorSolutions({
      kind: 'executor',
      start: 2,
      end: 10,
      square: true,
      multiplier: 2,
      add: 1,
      limit: 5,
    }),
  ).toThrow();
  expect(() =>
    executeCommands(
      { kind: 'executor', start: 2, end: 10, multiplier: 2, add: 1, limit: 5 },
      '3',
    ),
  ).toThrow();
  expect(() =>
    executeCommands(
      { kind: 'executor', start: 2, end: 10, multiplier: 2, add: 1, limit: 5 },
      '111111',
    ),
  ).toThrow();
  expect(() =>
    parameterInterval({
      kind: 'program-parameter',
      pairs: Array.from({ length: 9 }, () => [1, 2] as const),
      variable: 's',
      fixed: 0,
      yes: 9,
      mode: 'min',
    }),
  ).toThrow();
  expect(() =>
    numeralSum({
      kind: 'numerals',
      terms: [
        ['12', 2],
        ['1', 8],
      ],
    }),
  ).toThrow();
  expect(() =>
    numeralSum({
      kind: 'numerals',
      terms: [
        ['12', 3],
        ['1', 8],
      ],
    }),
  ).toThrow();
  expect(() =>
    queryAnswer({ kind: 'search', union: 10, left: 11, both: 1 }),
  ).toThrow();
  expect(() => queryAnswer({ kind: 'search', union: 10, left: 5 })).toThrow();
  expect(() =>
    pathCount({
      kind: 'paths',
      edges: [
        ['A', 'B'],
        ['B', 'A'],
      ],
      end: 'B',
    }),
  ).toThrow();
  expect(() =>
    pathCount({
      kind: 'paths',
      edges: [
        ['A', 'B'],
        ['A', 'B'],
      ],
      end: 'B',
    }),
  ).toThrow();
  expect(() =>
    urlOrders({ kind: 'url', fragments: ['x'], target: 'x' }),
  ).toThrow();
  expect(
    decodeSolutions({ kind: 'decode', codes: { А: '.-' }, encoded: '-' }),
  ).toEqual([]);
  expect(() =>
    decodeSolutions({ kind: 'decode', codes: { А: 'x' }, encoded: 'x' }),
  ).toThrow();
});
test('logic partitions prove the infinite tail and natural-number boundary', () => {
  expect(
    logicAnswer({ kind: 'logic', predicate: ['le', 1000], mode: 'count-true' }),
  ).toBe(1000);
  expect(
    logicAnswer({
      kind: 'logic',
      predicate: ['and', ['le', 1000], ['odd']],
      mode: 'count-true',
    }),
  ).toBe(500);
  expect(
    logicAnswer({
      kind: 'logic',
      predicate: ['not', ['eq', 1000]],
      mode: 'min-false',
    }),
  ).toBe(1000);
  expect(
    logicAnswer({
      kind: 'logic',
      predicate: ['not', ['le', 1000]],
      mode: 'min-false',
    }),
  ).toBe(1);
  expect(
    logicAnswer({
      kind: 'logic',
      predicate: ['and', ['gt', 5], ['le', 5]],
      mode: 'count-true',
    }),
  ).toBe(0);
});
