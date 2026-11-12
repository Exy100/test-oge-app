import { describe, expect, it } from 'vitest';
import {
  codeProblem,
  codeWalk,
  repeatedLetters,
} from '../../src/lib/interactives/code-lab';
import {
  analyzeSignal,
  encodeMessage,
} from '../../src/lib/interactives/decoder';

describe('code laboratory tasks', () => {
  for (const scenario of ['read', 'branches', 'repeats'] as const)
    it(`${scenario}: all variants have exactly one complete decoding`, () => {
      for (let v = 0; v < 100; v++) {
        const p = codeProblem(scenario, v);
        expect(analyzeSignal(p.entries, p.signal).messages).toEqual([
          p.message,
        ]);
        expect(p.frames.at(-1)?.path).toBe(p.message);
        for (const f of p.frames) {
          const offset = encodeMessage(p.entries, f.path).length;
          expect(p.signal.startsWith(encodeMessage(p.entries, f.path))).toBe(
            true,
          );
          if (f.dead)
            expect(
              p.entries.every((e) => !p.signal.startsWith(e.code, offset)),
            ).toBe(true);
        }
        if (scenario !== 'read')
          expect(p.frames.some((f) => f.dead)).toBe(true);
        if (scenario === 'repeats') {
          expect(p.answer.length).toBeGreaterThan(0);
          expect(p.answer.length).toBeLessThan(new Set(p.message).size);
          expect(p.answer).toBe(repeatedLetters(p.message));
        }
        expect(p.frames.length).toBeLessThanOrEqual(40);
        expect(codeProblem(scenario, v)).toEqual(p);
      }
    });
  it('keeps dead branches, rejects ambiguous input and invalid variants', () => {
    const p = codeProblem('branches', 0);
    expect(p.frames.some((f) => f.dead && f.path === 'Б')).toBe(true);
    expect(() =>
      codeWalk(
        [
          { letter: 'А', code: '0' },
          { letter: 'Б', code: '00' },
        ],
        '00',
      ),
    ).toThrow();
    expect(() => codeProblem('read', -1)).toThrow();
    expect(repeatedLetters('ВАБАВ')).toBe('АВ');
  });
});
