import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  bases,
  numeral,
  convert,
  numeralSum,
} from '../../src/lib/interactives/numerals';
import {
  folders,
  trainingFiles,
  inFolder,
  maskMatches,
  selectTrainingFiles,
  searchTrainingFiles,
} from '../../src/lib/interactives/training-files';
import { readZip } from '../../src/core/datasets/zip';
import { GET } from '../../src/pages/materials/files/training.zip';

describe('positional arithmetic independent of the displayed decomposition', () => {
  it.each(bases)(
    'matches native conversion and recovers every value up to 4095 in base %i',
    (base) => {
      for (const value of [
        ...Array.from({ length: 4096 }, (_, i) => i),
        65535,
      ]) {
        const text = value.toString(base).toUpperCase(),
          result = numeral(text, base),
          output = convert(value, base);
        expect(result.value).toBe(Number.parseInt(text, base));
        expect(output.text).toBe(text);
        for (const step of output.divisions) {
          expect(step.dividend).toBe(step.quotient * base + step.remainder);
          expect(step.remainder).toBeLessThan(base);
        }
      }
    },
  );
  it('rejects invalid digits, fractions, signs, absent values, unsupported bases and overflow', () => {
    for (const [raw, base] of [
      ['2', 2],
      ['8', 8],
      ['G', 16],
      ['1 0', 2],
      ['-1', 10],
      ['1.2', 10],
      ['', 2],
      ['65536', 10],
      ['11111111111111111', 2],
      ['10', 3],
    ] as const)
      expect(() => numeral(raw, base)).toThrow(RangeError);
    for (const value of [-1, 0.5, 65536, NaN, Infinity])
      expect(() => convert(value, 2)).toThrow(RangeError);
    expect(numeral(' 00ff ', 16).value).toBe(255);
    const padded = numeral('0000000000000001', 16);
    expect(padded.value).toBe(1);
    expect(padded.terms[0]).toMatchObject({
      value: 0,
      weight: '1152921504606846976',
    });
    expect(convert(0, 2)).toEqual({
      text: '0',
      divisions: [{ dividend: 0, quotient: 0, remainder: 0 }],
    });
  });
  it('sums independent values in all three exam bases on 500 inputs', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 65535 }),
          fc.integer({ min: 0, max: 65535 }),
          fc.integer({ min: 0, max: 65535 }),
        ),
        ([a, b, c]) => {
          expect(numeralSum(a.toString(2), b.toString(8), c.toString(16))).toBe(
            a + b + c,
          );
        },
      ),
      { numRuns: 500, seed: 7910 },
    );
  });
});

describe('actual UTF-8 files and independent file selection', () => {
  it('builds the downloadable ZIP from exactly the files the scenes read', async () => {
    const response = GET(),
      files = readZip(new Uint8Array(await response.arrayBuffer()));
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(files.size).toBe(trainingFiles.length);
    for (const { path, text } of trainingFiles)
      expect(Buffer.from(files.get(path) ?? []).toString('utf8')).toBe(text);
  });
  it('uses path segments, distinguishes direct children and descendants and never merges repeated names', () => {
    expect(inFolder('Тексты-архив/Нина/причал.txt', 'Тексты', true)).toBe(
      false,
    );
    expect(selectTrainingFiles('Тексты/Нина', false, '*').files).toHaveLength(
      2,
    );
    expect(selectTrainingFiles('Тексты/Нина', true, '*').files).toHaveLength(3);
    expect(selectTrainingFiles('', true, 'причал.txt').files).toHaveLength(4);
    expect(selectTrainingFiles('', false, '*').files).toHaveLength(0);
    expect(() => selectTrainingFiles('нет', true, '*')).toThrow();
  });
  it('matches wildcard semantics against independently built regular expressions on 500 bounded Unicode names', () => {
    const chars = fc.constantFrom('a', 'b', 'я', 'ё', '.', '[', ']', '+'),
      token = fc.constantFrom('a', 'b', 'я', 'ё', '.', '[', ']', '+', '*', '?');
    fc.assert(
      fc.property(
        fc.array(chars, { maxLength: 14 }),
        fc.array(token, { minLength: 1, maxLength: 10 }),
        (nameChars, maskChars) => {
          const name = nameChars.join(''),
            mask = maskChars.join('');
          const expression = Array.from(mask, (char) =>
            char === '*'
              ? '.*'
              : char === '?'
                ? '.'
                : char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
          ).join('');
          expect(maskMatches(name, mask)).toBe(
            new RegExp('^' + expression + '$', 'iu').test(name),
          );
        },
      ),
      { numRuns: 500, seed: 7912 },
    );
    expect(maskMatches('note_.txt', 'note_*.txt')).toBe(true);
    expect(maskMatches('note_.txt', 'note_?.txt')).toBe(false);
    expect(maskMatches('note_ab.txt', 'note_?.txt')).toBe(false);
    expect(maskMatches('NOTE_A.TXT', 'note_?.txt')).toBe(true);
    for (const mask of ['', 'folder/*.txt', '\\*.txt', 'a'.repeat(81)])
      expect(() => maskMatches('a', mask)).toThrow();
  });
  it('counts bytes of selected contents rather than characters, directory entries or archive size', () => {
    for (const folder of folders)
      for (const recursive of [false, true])
        for (const mask of [
          '*',
          '*.txt',
          'note_?.txt',
          'note_*.txt',
          '*.csv',
          'нет.*',
        ]) {
          const selection = selectTrainingFiles(folder, recursive, mask);
          expect(selection.bytes).toBe(
            Buffer.byteLength(
              selection.files.map((file) => file.text).join(''),
              'utf8',
            ),
          );
        }
    const selection = selectTrainingFiles('Данные', true, 'note_?.txt');
    expect(selection.files.map((file) => file.path)).toEqual([
      'Данные/note_a.txt',
      'Данные/old/note_b.txt',
    ]);
    expect(selection.bytes).toBeGreaterThan(
      selection.files.reduce((sum, file) => sum + file.text.length, 0),
    );
    expect(selectTrainingFiles('Данные', true, 'нет.*')).toEqual({
      files: [],
      bytes: 0,
    });
  });
  it('finds contents with Unicode word boundaries, literal punctuation and explicit author scope', () => {
    const all = searchTrainingFiles('', 'МАЯК', false),
      words = searchTrainingFiles('', 'маяк', true);
    expect(all.reduce((sum, hit) => sum + hit.positions.length, 0)).toBe(6);
    expect(words.reduce((sum, hit) => sum + hit.positions.length, 0)).toBe(4);
    const matches = searchTrainingFiles('Тексты/Нина', 'полезный труд', false);
    expect(matches).toHaveLength(2);
    expect(
      matches.every((hit) => hit.file.path.startsWith('Тексты/Нина/')),
    ).toBe(true);
    for (const hit of matches)
      for (const position of hit.positions)
        expect(hit.file.text.slice(position, position + hit.length)).toBe(
          'полезный труд',
        );
    expect(searchTrainingFiles('', '.*', false)).toEqual([]);
    expect(searchTrainingFiles('', 'Маяк.', true)).toHaveLength(3);
    for (const query of ['', ' ', 'a'.repeat(81)])
      expect(() => searchTrainingFiles('', query, false)).toThrow();
    expect(() => searchTrainingFiles('нет', 'маяк', false)).toThrow();
  });
});
