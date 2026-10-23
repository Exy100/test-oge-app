import { describe, expect, it } from 'vitest';
import {
  addressLabs,
  addressParts,
  assembleAddress,
} from '../../src/lib/interactives/networks';
import {
  compareSearch,
  conditionalSearch,
  initialRegions,
  parseSearch,
  searchRegions,
} from '../../src/lib/interactives/search';
import { queryAnswer } from '../../src/core/generators/exam/short-problems';
import { shortFixtures } from '../fixtures/exam/short-answers';
function permutations(values: readonly string[]): string[][] {
  return values.length
    ? values.flatMap((value, index) =>
        permutations(values.filter((_, other) => index !== other)).map(
          (tail) => [value, ...tail],
        ),
      )
    : [[]];
}
describe('literal URL construction', () => {
  it.each(Object.entries(addressLabs))(
    '%s checks all 5040 permutations independently',
    (_, lab) => {
      const { problem } = lab;
      const accepted: string[] = [];
      for (const order of permutations(['1', '2', '3', '4', '5', '6', '7'])) {
        const sequence = order.join(''),
          expected = order
            .map((digit) => problem.fragments[Number(digit) - 1])
            .join('');
        const result = assembleAddress(problem, sequence);
        expect(result).toEqual({
          address: expected,
          complete: true,
          correct: expected === problem.target,
        });
        if (result.correct) accepted.push(sequence);
      }
      expect(accepted.length).toBeGreaterThan(0);
      if (lab === addressLabs.overlap)
        expect(accepted).toEqual(['1234567', '1234657']);
      const parts = addressParts(problem.target);
      expect(`${parts.scheme}://${parts.host}${parts.path}`).toBe(
        problem.target,
      );
    },
  );
  it('supports partial assembly and rejects duplicates, extra labels and unsupported URL components', () => {
    expect(assembleAddress(addressLabs.https.problem, '')).toEqual({
      address: '',
      complete: false,
      correct: false,
    });
    expect(assembleAddress(addressLabs.https.problem, '4')).toEqual({
      address: 'https',
      complete: false,
      correct: false,
    });
    for (const sequence of ['11', '12345678', '0', '1 2', '１２', '12345677'])
      expect(() =>
        assembleAddress(addressLabs.https.problem, sequence),
      ).toThrow();
    for (const url of [
      'javascript:alert(1)',
      'https://user:pass@atlas.ru/map.txt',
      'https://atlas.ru/map.txt?q=1',
      'https://atlas.ru/map.txt#end',
    ])
      expect(() => addressParts(url)).toThrow();
    expect(() =>
      assembleAddress(
        {
          ...addressLabs.https.problem,
          target: 'https://unreachable.example/other.txt',
        },
        '',
      ),
    ).toThrow();
  });
  it('accepts the official URL answers without adding or normalizing symbols', () => {
    const fixtures = shortFixtures.filter((f) => f.parameters.kind === 'url');
    expect(fixtures).toHaveLength(3);
    for (const fixture of fixtures)
      if (fixture.parameters.kind === 'url')
        for (const answer of fixture.answers)
          expect(assembleAddress(fixture.parameters, answer).correct).toBe(
            true,
          );
  });
});
function formula(vector: number): string {
  const ones = Array.from({ length: 8 }, (_, mask) => mask).filter(
    (mask) => (vector & (2 ** mask)) !== 0,
  );
  if (ones.length > 4) return `НЕ (${formula(255 ^ vector)})`;
  if (!ones.length) return 'A & НЕ A';
  return ones
    .map(
      (mask) =>
        `(${['A', 'B', 'C'].map((letter, index) => ((mask & (2 ** index)) !== 0 ? letter : `НЕ ${letter}`)).join(' & ')})`,
    )
    .join(' | ');
}
describe('three-set query semantics', () => {
  it('represents all 256 Boolean selections and counts each actual page once', () => {
    for (let vector = 0; vector < 256; vector++) {
      const source = formula(vector),
        expected = Array.from(
          { length: 8 },
          (_, mask) => (vector & (2 ** mask)) !== 0,
        );
      expect(searchRegions(source, initialRegions).selected).toEqual(expected);
      const pages = initialRegions.flatMap((n, mask) =>
        Array.from({ length: n }, () => mask),
      );
      expect(searchRegions(source, initialRegions).total).toBe(
        pages.filter((mask) => (vector & (2 ** mask)) !== 0).length,
      );
      expect(
        compareSearch(source, `НЕ (НЕ (${source}))`, initialRegions).equivalent,
      ).toBe(true);
    }
  });
  it('handles distribution, parentheses, Russian aliases, negation and empty regions', () => {
    expect(
      compareSearch('А И (В ИЛИ С)', 'A & B | A & C', initialRegions)
        .equivalent,
    ).toBe(true);
    expect(
      compareSearch('A & B | C', 'A & (B | C)', initialRegions).equivalent,
    ).toBe(false);
    expect(
      compareSearch('НЕ (A | B)', 'НЕ A & НЕ B', initialRegions).equivalent,
    ).toBe(true);
    expect(
      compareSearch('A', 'A & B & C', [0, 0, 0, 0, 0, 0, 0, 10]).equivalent,
    ).toBe(false);
    expect(searchRegions('НЕ (A | B | C)', initialRegions).total).toBe(
      initialRegions[0],
    );
    for (const query of [
      '',
      'A && B',
      'A |',
      '(A & B',
      'A B',
      'D',
      'A()',
      'A + B',
      'НЕ '.repeat(25) + 'A',
      'A'.repeat(161),
    ])
      expect(() => parseSearch(query)).toThrow();
    for (const counts of [
      [1, 2],
      [-1, 0, 0, 0, 0, 0, 0, 0],
      [10001, 0, 0, 0, 0, 0, 0, 0],
      [1.5, 0, 0, 0, 0, 0, 0, 0],
    ])
      expect(() => searchRegions('A', counts)).toThrow();
  });
  it('solves both exam questions by independent enumeration of pages inside A', () => {
    for (let seed = 0; seed < 200; seed++) {
      const counts = Array.from(
        { length: 8 },
        (_, mask) => (seed * 17 + mask * 3) % 11,
      );
      const pages = counts.flatMap((n, mask) =>
        Array.from({ length: n }, () => ({
          a: (mask & 1) !== 0,
          b: (mask & 2) !== 0,
          c: (mask & 4) !== 0,
        })),
      );
      const triple = pages.filter((p) => p.a && p.b && p.c).length,
        pair = pages.filter((p) => p.a && p.c).length;
      expect(queryAnswer(conditionalSearch(counts, 'triple'))).toBe(triple);
      expect(queryAnswer(conditionalSearch(counts, 'pair'))).toBe(pair);
      const changed = counts.map((n, mask) => ((mask & 1) === 0 ? n + 100 : n));
      expect(conditionalSearch(changed, 'triple')).toEqual(
        conditionalSearch(counts, 'triple'),
      );
    }
  });
  it('agrees with both questions from official search fixtures', () => {
    const fixtures = shortFixtures.filter(
      (f) => f.parameters.kind === 'search',
    );
    expect(fixtures).toHaveLength(3);
    for (const fixture of fixtures)
      if (fixture.parameters.kind === 'search') {
        const p = fixture.parameters;
        const both = p.both ?? p.left + (p.right ?? 0) - p.union,
          right = p.right ?? p.union - p.left + both;
        const counts = [0, 0, 0, p.left - both, 0, right - both, 0, both];
        expect(
          String(
            queryAnswer(
              conditionalSearch(
                counts,
                p.right === undefined ? 'pair' : 'triple',
              ),
            ),
          ),
        ).toBe(fixture.answers[0]);
      }
  });
});
