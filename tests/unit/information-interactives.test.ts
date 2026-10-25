import { describe, expect, it } from 'vitest';
import {
  alphabetCapacity,
  byteGroups,
  removeListedWord,
  textVolume,
} from '../../src/lib/interactives/information';
import {
  analyzeSignal,
  decoderPresets,
  encodeMessage,
  type CodeEntry,
} from '../../src/lib/interactives/decoder';
import { shortFixtures } from '../fixtures/exam/short-answers';

/** Independent oracle: enumerate every partition, then look each group up in the table. */
function partitions(entries: readonly CodeEntry[], signal: string) {
  const messages: string[] = [];
  for (let mask = 0; mask < 2 ** (signal.length - 1); mask++) {
    const groups: string[] = [];
    let start = 0;
    for (let position = 1; position < signal.length; position++)
      if (mask & (2 ** (position - 1))) {
        groups.push(signal.slice(start, position));
        start = position;
      }
    groups.push(signal.slice(start));
    const letters = groups.map(
      (code) => entries.find((entry) => entry.code === code)?.letter,
    );
    if (letters.every((letter) => letter !== undefined))
      messages.push(letters.join(''));
  }
  return messages.sort();
}

describe('text volume model', () => {
  it('counts spaces, punctuation and line breaks with fixed-width cells, not UTF-8 bytes', () => {
    for (const width of [8, 16, 32]) {
      for (const text of ['', 'ёж, кот', 'A  B\nЯ', '1—2!?']) {
        const cells = Array.from(text).flatMap(() =>
          Array.from({ length: width / 8 }, () => new Uint8Array(8)),
        );
        expect(textVolume(text, width)).toEqual({
          characters: Array.from(text).length,
          bytes: cells.length,
          bits: cells.flatMap((cell) => [...cell]).length,
        });
      }
    }
  });
  it('removes the separator at either end as well as in the middle', () => {
    const words = ['дуб', 'клён', 'сосна'];
    for (let index = 0; index < words.length; index++) {
      const after = removeListedWord(words, index);
      expect(after.split(', ')).toEqual(
        words.filter((_, position) => position !== index),
      );
      expect(
        textVolume(words.join(', '), 16).bytes - textVolume(after, 16).bytes,
      ).toBe((Array.from(words[index] ?? '').length + 2) * 2);
    }
    expect(words).toEqual(['дуб', 'клён', 'сосна']);
  });
  it('reproduces official №1 changes by actually constructing the shortened string', () => {
    for (const fixture of shortFixtures.filter(
      (item) => item.taskNumber === 1,
    )) {
      const p = fixture.parameters;
      if (p.kind !== 'deleted-word') throw new Error('Неверная фикстура.');
      const before = textVolume(p.words.join(', '), p.bits);
      const possible = p.words.filter(
        (_, index) =>
          before.bytes -
            textVolume(removeListedWord(p.words, index), p.bits).bytes ===
          p.bytes,
      );
      expect(possible).toEqual(fixture.answers);
    }
  });
  it('rejects unsupported encodings, unsupported signs and unbounded texts', () => {
    expect(() => textVolume('кот', 7)).toThrow();
    expect(() => textVolume('a'.repeat(161), 8)).toThrow();
    expect(() => textVolume('🙂', 16)).toThrow();
    expect(() => removeListedWord(['кот'], 0)).toThrow();
    expect(() => removeListedWord(['кот', 'дуб'], -1)).toThrow();
  });
});

describe('bits, bytes and alphabets', () => {
  it('compares all 2–64 alphabet sizes against independently enumerated binary words', () => {
    let words = [''];
    const capacities: number[] = [];
    for (let width = 1; width <= 6; width++) {
      words = words.flatMap((word) => [word + '0', word + '1']);
      capacities.push(new Set(words).size);
    }
    for (let size = 2; size <= 64; size++)
      for (let width = 1; width <= 6; width++) {
        const capacity = capacities[width - 1] ?? 0;
        expect(alphabetCapacity(size, width)).toEqual({
          capacity,
          fits: capacity >= size,
          minimum: capacities.findIndex((value) => value >= size) + 1,
        });
      }
  });
  it('groups every allowed bit count into actual strings of eight bits and a tail', () => {
    for (let bits = 0; bits <= 1024; bits++) {
      const groups = '0'.repeat(bits).match(/.{1,8}/gu) ?? [];
      expect(byteGroups(bits)).toEqual({
        full: groups.filter((group) => group.length === 8).length,
        remainder: groups.find((group) => group.length < 8)?.length ?? 0,
      });
    }
    for (const bits of [-1, 1.5, 1025, NaN])
      expect(() => byteGroups(bits)).toThrow();
    for (const size of [0, 1, 65, 2.1])
      expect(() => alphabetCapacity(size, 3)).toThrow();
  });
});

describe('code table decoder', () => {
  it('compares every binary signal up to eight signs with every possible partition', () => {
    for (const preset of [
      decoderPresets.prefix,
      decoderPresets.nonprefix,
      decoderPresets.ambiguous,
    ]) {
      const entries = preset.codes.map((code, index) => ({
        letter: 'АБВГ'[index] ?? '',
        code,
      }));
      for (let length = 1; length <= 8; length++)
        for (let value = 0; value < 2 ** length; value++) {
          const signal = value.toString(2).padStart(length, '0');
          const oracle = partitions(entries, signal);
          const actual = analyzeSignal(entries, signal);
          expect(actual.count).toBe(BigInt(oracle.length));
          expect(actual.messages).toHaveLength(Math.min(20, oracle.length));
          expect(new Set(actual.messages).size).toBe(actual.messages.length);
          for (const message of actual.messages)
            expect(oracle).toContain(message);
          for (const message of actual.messages)
            expect(encodeMessage(entries, message)).toBe(signal);
        }
    }
  });
  it('distinguishes a dead end, one valid nonprefix decoding and two valid ones', () => {
    for (const [key, expected] of [
      ['nonprefix', ['АВ']],
      ['ambiguous', ['АВ', 'БА']],
      ['signals', ['АВ']],
    ] as const) {
      const preset = decoderPresets[key];
      const entries = preset.codes.map((code, index) => ({
        letter: 'АБВГ'[index] ?? '',
        code,
      }));
      expect(analyzeSignal(entries, preset.signal)).toMatchObject({
        prefixFree: false,
        count: BigInt(expected.length),
        messages: expected,
      });
    }
  });
  it('uses real official symbolic tables without requiring prefix-freeness', () => {
    for (const fixture of shortFixtures.filter(
      (item) => item.taskNumber === 2,
    )) {
      const p = fixture.parameters;
      if (p.kind !== 'decode') throw new Error('Неверная фикстура.');
      const entries = Object.entries(p.codes).map(([letter, code]) => ({
        letter,
        code,
      }));
      const actual = analyzeSignal(entries, p.encoded);
      expect(actual.count).toBe(1n);
      const message = actual.messages[0] ?? '';
      const answer = p.repeatedOnly
        ? [
            ...new Set(
              Array.from(message).filter(
                (letter) => message.split(letter).length > 2,
              ),
            ),
          ]
            .sort()
            .join('')
        : message;
      expect(
        fixture.answers.map((value) =>
          p.repeatedOnly ? Array.from(value).sort().join('') : value,
        ),
      ).toContain(answer);
      expect(encodeMessage(entries, message)).toBe(p.encoded);
    }
  });
  it('bounds listing without losing the exact ambiguity count', () => {
    const entries = [
      { letter: 'А', code: '0' },
      { letter: 'Б', code: '00' },
    ];
    const actual = analyzeSignal(entries, '0'.repeat(24));
    // Each complete path is a tiling by one- and two-sign words (Fibonacci).
    let one = 1n,
      two = 1n;
    for (let length = 2; length <= 24; length++) [one, two] = [two, one + two];
    expect(actual.count).toBe(two);
    expect(actual.messages).toHaveLength(20);
    expect(analyzeSignal(entries, '1').count).toBe(0n);
  });
  it('rejects duplicate, empty and oversized codes and signals', () => {
    for (const codes of [
      ['0', '0'],
      ['', '1'],
      ['000000', '1'],
      ['<', '1'],
    ])
      expect(() =>
        analyzeSignal(
          codes.map((code, index) => ({ code, letter: index ? 'Б' : 'А' })),
          '0',
        ),
      ).toThrow();
    for (const signal of ['', '0 1', '0'.repeat(65)])
      expect(() =>
        analyzeSignal(
          [
            { letter: 'А', code: '0' },
            { letter: 'Б', code: '1' },
          ],
          signal,
        ),
      ).toThrow();
    expect(() => encodeMessage([{ letter: 'А', code: '0' }], 'Б')).toThrow();
  });
});
