import { describe, expect, it } from 'vitest';
import { solveProblem } from '../../src/core/generators/exam/short-tasks';
import {
  checkMemoryAnswer,
  memoryProblem,
  memoryTokens,
} from '../../src/lib/interactives/memory-lab';

describe('memory laboratory: text and byte conservation', () => {
  it('explains the illustrated example without conflating bits and bytes', () => {
    expect(memoryProblem(0)).toMatchObject({
      word: 'сосна',
      bits: 16,
      bytes: 14,
      symbols: 7,
      letters: 5,
      after: 'дуб, клён, берёза',
    });
  });

  it('keeps one answer and removes exactly one comma and space, including both ends', () => {
    const positions = new Set<string>();
    const widths = new Set<number>();
    for (let index = 0; index < 500; index++) {
      const p = memoryProblem(index);
      const tokens = memoryTokens(p);
      const removed = tokens
        .filter((token) => token.removed)
        .map((token) => token.character)
        .join('');
      const remaining = tokens
        .filter((token) => !token.removed)
        .map((token) => token.character)
        .join('');
      expect(remaining).toBe(p.after);
      expect(remaining).not.toMatch(/(^,|,$| {2})/u);
      expect(
        Array.from(removed).filter((character) => character === ','),
      ).toHaveLength(1);
      expect(
        Array.from(removed).filter((character) => character === ' '),
      ).toHaveLength(1);
      expect(removed.replace(/[, ]/gu, '')).toBe(p.word);
      expect(
        (Array.from(p.before).length - Array.from(remaining).length) * p.bits,
      ).toBe(p.bytes * 8);
      expect(
        p.words.filter((word) => Array.from(word).length === p.letters),
      ).toEqual([p.word]);
      expect(p.symbols).toBe(p.letters + 2);
      expect(
        solveProblem({
          kind: 'deleted-word',
          words: p.words,
          bits: p.bits,
          bytes: p.bytes,
        }),
      ).toMatchObject({ type: 'word', value: p.word });
      if (index > 0) expect(p.before).not.toBe(memoryProblem(index - 1).before);
      positions.add(
        p.removedIndex === 0
          ? 'first'
          : p.removedIndex === p.words.length - 1
            ? 'last'
            : 'middle',
      );
      widths.add(p.bits);
    }
    expect(positions).toEqual(new Set(['first', 'middle', 'last']));
    expect(widths).toEqual(new Set([8, 16]));
  });

  it('accepts meaningful answers and explains the common mistakes', () => {
    const p = memoryProblem(0);
    for (const [step, value] of ['2', '7', '5', ' СОСНА '].entries())
      expect(checkMemoryAnswer(p, step, value).correct).toBe(true);
    expect(checkMemoryAnswer(p, 2, '7').message).toContain('не входят в слово');
    expect(checkMemoryAnswer(p, 2, '6').message).toContain(
      'и запятая, и пробел',
    );
    for (const value of ['', '2.0', '2e0', '-2', 'два'])
      expect(checkMemoryAnswer(p, 0, value).correct).toBe(false);
    expect(checkMemoryAnswer(p, 3, 'клён').correct).toBe(false);
    expect(() => memoryProblem(-1)).toThrow(RangeError);
    expect(() => memoryProblem(1.5)).toThrow(RangeError);
    expect(() => checkMemoryAnswer(p, 9, '1')).toThrow(RangeError);
  });
});
