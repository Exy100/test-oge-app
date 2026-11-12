import { expect, test } from 'vitest';
import {
  editSymbolExample,
  symbolExample,
  symbolExamples,
  symbolWords,
  type SymbolScenario,
} from '../../src/lib/interactives/symbol-examples';
test('curated answers are unique and the actual edited text conserves bytes', () => {
  for (const scenario of Object.keys(symbolExamples) as SymbolScenario[]) {
    for (const example of symbolExamples[scenario]) {
      const words = symbolWords(example.text);
      const accepted = words.filter(
        (w) =>
          editSymbolExample(example, scenario, w.start).delta === example.delta,
      );
      expect(accepted.map((w) => w.word)).toEqual([example.word]);
      for (const word of words) {
        const result = editSymbolExample(example, scenario, word.start);
        expect(
          (Math.abs(
            Array.from(result.before).length - Array.from(result.after).length,
          ) *
            example.bits) /
            8,
        ).toBe(result.delta);
        expect(result.after).not.toMatch(/ {2}|^ | $/u);
        expect(result.after.endsWith('…')).toBe(result.before.endsWith('…'));
        const originalOccurrences = words.filter(
          (w) => w.word === word.word,
        ).length;
        const updatedOccurrences = symbolWords(result.after).filter(
          (w) => w.word === word.word,
        ).length;
        expect(updatedOccurrences).toBe(
          originalOccurrences + (scenario === 'sentence-delete' ? -1 : 1),
        );
      }
    }
  }
});
test('provided arithmetic mistakes are corrected and separators are not interchangeable', () => {
  const repeated = symbolExample('sentence-repeat', 0);
  expect(repeated).toMatchObject({ word: 'пустые', bits: 16, delta: 14 });
  const start = symbolWords(repeated.text).find(
    (w) => w.word === 'пустые',
  )?.start;
  expect(start).toBeDefined();
  expect(
    editSymbolExample(repeated, 'sentence-repeat', start ?? -1).after,
  ).toContain('пустые пустые…');
  expect(symbolExample('list-repeat', 0)).toMatchObject({
    word: 'Попов',
    bits: 8,
    delta: 7,
  });
  expect(symbolExample('sentence-delete', 4)).toMatchObject({
    word: 'про',
    delta: 4,
  });
  const hyphen = symbolExamples['list-repeat'].find(
    (p) => p.word === 'Винни-Пух',
  );
  expect(hyphen).toMatchObject({ delta: 11 });
  expect(Array.from('Винни-Пух')).toHaveLength(9);
});
test('banks wrap independently and reject invalid selections', () => {
  for (const scenario of Object.keys(symbolExamples) as SymbolScenario[]) {
    expect(symbolExample(scenario, symbolExamples[scenario].length)).toEqual(
      symbolExample(scenario, 0),
    );
    expect(() => symbolExample(scenario, -1)).toThrow();
    expect(() => symbolExample(scenario, 0.5)).toThrow();
    expect(() =>
      editSymbolExample(symbolExample(scenario, 0), scenario, -1),
    ).toThrow();
  }
});
