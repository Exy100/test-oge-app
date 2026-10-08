import { expect, test } from 'vitest';
import fc from 'fast-check';
import { checkAnswer, checkTaskAnswer, normalizeAnswer } from './index';
import type { ShortAnswer } from './index';
import { taskExample } from '../../../tests/fixtures/model-examples';

const integer = { type: 'integer', value: '48' } as const;
test.each([
  ['48', 'correct'],
  [' 48 ', 'correct'],
  ['\t48\n', 'correct'],
  ['\u00a048\u00a0', 'correct'],
  ['+48', 'correct'],
  ['00048', 'correct'],
  ['+00048', 'correct'],
  ['49', 'incorrect'],
  ['-48', 'incorrect'],
  ['0', 'incorrect'],
  ['-0', 'incorrect'],
  ['900719925474099300000000', 'incorrect'],
  ['', 'format_error'],
  [' ', 'format_error'],
  ['\u00a0', 'format_error'],
  ['+', 'format_error'],
  ['-', 'format_error'],
  ['++48', 'format_error'],
  ['+-48', 'format_error'],
  ['48.0', 'format_error'],
  ['48,0', 'format_error'],
  ['4.8e1', 'format_error'],
  ['0x30', 'format_error'],
  ['0b110000', 'format_error'],
  ['3/4', 'format_error'],
  ['4 8', 'format_error'],
  ['4\u00a08', 'format_error'],
  ['4\t8', 'format_error'],
  ['48 байт', 'format_error'],
  ['４８', 'format_error'],
  ['٤٨', 'format_error'],
  ['−48', 'format_error'],
  ['NaN', 'format_error'],
  ['Infinity', 'format_error'],
  ['48\u200b', 'format_error'],
  ['48\0', 'format_error'],
] as const)('integer %j gives %s', (raw, verdict) => {
  const result = checkAnswer(integer, raw);
  expect(result.verdict).toBe(verdict);
  expect(result.counted).toBe(verdict !== 'format_error');
});

test.each([
  ['0', '-000', 'correct'],
  ['0', '+000', 'correct'],
  ['-48', '-00048', 'correct'],
  ['9007199254740992', '9007199254740993', 'incorrect'],
  ['9007199254740993', '+009007199254740993', 'correct'],
  ['-9007199254740993', '-9007199254740992', 'incorrect'],
] as const)('exact integer %s versus %s: %s', (value, raw, verdict) => {
  expect(checkAnswer({ type: 'integer', value }, raw).verdict).toBe(verdict);
});

const word = { type: 'word', value: 'Ёж', caseSensitive: false } as const;
test.each([
  ['Ёж', 'correct'],
  ['ёж', 'correct'],
  ['ЁЖ', 'correct'],
  [' Е\u0308ж\u00a0', 'correct'],
  ['Еж', 'incorrect'],
  ['Ё ж', 'incorrect'],
  ['Ё\u00a0ж', 'incorrect'],
  ['Ёж!', 'incorrect'],
  ['Ёж,', 'incorrect'],
  ['Eж', 'incorrect'],
  ['3/4', 'incorrect'],
  ['', 'format_error'],
  ['\u00a0', 'format_error'],
  ['Ё\tж', 'format_error'],
  ['Ё\nж', 'format_error'],
  ['Ё\u200bж', 'format_error'],
  ['Ё\u202eж', 'format_error'],
] as const)('word %j gives %s', (raw, verdict) => {
  const result = checkAnswer(word, raw);
  expect(result.verdict).toBe(verdict);
  expect(result.counted).toBe(verdict !== 'format_error');
});

test.each([
  [{ type: 'word', value: 'Ёж', caseSensitive: true }, 'ёж', 'incorrect'],
  [{ type: 'word', value: 'Ёж', caseSensitive: true }, 'Е\u0308ж', 'correct'],
  [
    { type: 'word', value: 'два слова', caseSensitive: false },
    'ДВА СЛОВА',
    'correct',
  ],
  [
    { type: 'word', value: 'два слова', caseSensitive: false },
    'дваслова',
    'incorrect',
  ],
  [
    { type: 'word', value: 'два слова', caseSensitive: false },
    'два\u00a0слова',
    'incorrect',
  ],
  [{ type: 'word', value: '3/4', caseSensitive: true }, '0.75', 'incorrect'],
  [{ type: 'word', value: 'А', caseSensitive: false }, 'A', 'incorrect'],
  [{ type: 'word', value: 'О', caseSensitive: false }, '0', 'incorrect'],
] as const)('word policy %#', (answer, raw, verdict) => {
  expect(checkAnswer(answer, raw).verdict).toBe(verdict);
});

const digits = {
  type: 'sequence',
  value: '00102',
  alphabet: 'digits',
  caseSensitive: true,
} as const;
test.each([
  ['00102', 'correct'],
  [' 00102 ', 'correct'],
  ['0 0 1 0 2', 'correct'],
  ['0\u00a00 1 02', 'correct'],
  ['102', 'incorrect'],
  ['00120', 'incorrect'],
  ['000102', 'incorrect'],
  ['20100', 'incorrect'],
  ['', 'format_error'],
  ['  ', 'format_error'],
  ['0,0,1,0,2', 'format_error'],
  ['+00102', 'format_error'],
  ['00102.0', 'format_error'],
  ['00\t102', 'format_error'],
  ['00\n102', 'format_error'],
  ['00О02', 'format_error'],
  ['００１０２', 'format_error'],
  ['0\u200b0102', 'format_error'],
] as const)('digit sequence %j gives %s', (raw, verdict) => {
  const result = checkAnswer(digits, raw);
  expect(result.verdict).toBe(verdict);
  expect(result.counted).toBe(verdict !== 'format_error');
});

test.each([
  ['latin', false, 'Az', 'aZ', 'correct'],
  ['latin', true, 'Az', 'aZ', 'incorrect'],
  ['latin', true, 'AB', 'A B', 'correct'],
  ['latin', false, 'AB', 'АВ', 'format_error'],
  ['latin', false, 'AB', 'A1', 'format_error'],
  ['latin', false, 'AB', 'A,B', 'format_error'],
  ['cyrillic', false, 'АЁЙ', 'ае\u0308и\u0306', 'correct'],
  ['cyrillic', true, 'АЁЙ', 'аёй', 'incorrect'],
  ['cyrillic', false, 'АВ', 'AB', 'format_error'],
  ['cyrillic', false, 'О', '0', 'format_error'],
  ['cyrillic', false, 'АБ', 'БА', 'incorrect'],
  ['cyrillic', true, 'АБ', 'А Б', 'correct'],
] as const)(
  'letter sequence %# respects alphabet and case',
  (alphabet, caseSensitive, value, raw, verdict) => {
    expect(
      checkAnswer({ type: 'sequence', value, alphabet, caseSensitive }, raw)
        .verdict,
    ).toBe(verdict);
  },
);

test('only internal sequence spaces produce a bank-form notice, even for wrong answers', () => {
  for (const raw of ['0 0 1 0 2', '1 0 0']) {
    const result = checkAnswer(digits, raw);
    expect(result.verdict).not.toBe('format_error');
    if (result.verdict !== 'format_error') {
      expect(result.notices).toEqual([
        {
          code: 'sequence_spacing',
          message:
            'Пробелы между символами не учитывались. На бланке запиши последовательность подряд, без пробелов.',
        },
      ]);
    }
  }
  expect(checkAnswer(digits, '\u00a000102\n')).toMatchObject({ notices: [] });
});

test('typical mistakes use the same normalisation and never override a correct answer', () => {
  const mistakes = [
    { answer: '4.8', explanation: 'Недопустимый формат не совпадает с целым.' },
    { answer: '6', explanation: 'Ты разделил на восемь вместо умножения.' },
    { answer: '48', explanation: 'Этот пункт ошибочно повторяет эталон.' },
  ];
  expect(checkAnswer(integer, '+0006', mistakes)).toMatchObject({
    verdict: 'incorrect',
    explanation: mistakes[1]?.explanation,
  });
  expect(checkAnswer(integer, '48', mistakes)).not.toHaveProperty(
    'explanation',
  );
  expect(checkAnswer(integer, '47', mistakes)).not.toHaveProperty(
    'explanation',
  );
  expect(checkAnswer(integer, '4.8', mistakes)).toMatchObject({
    verdict: 'format_error',
    counted: false,
  });
  expect(
    checkAnswer(word, 'ЕЖ', [
      { answer: 'Еж', explanation: 'Буквы е и ё различаются.' },
    ]),
  ).toMatchObject({ explanation: 'Буквы е и ё различаются.' });
  expect(
    checkAnswer(digits, '1 0 2', [
      { answer: '102', explanation: 'Потеряны ведущие нули.' },
    ]),
  ).toMatchObject({ explanation: 'Потеряны ведущие нули.' });
});

test('task wrapper checks computer short answers and rejects artifacts', () => {
  for (const number of [1, 11, 12] as const) {
    const task = taskExample(number);
    if (task.answer.type !== 'integer')
      throw new Error('Нужен целый ответ примера.');
    expect(checkTaskAnswer(task, task.answer.value)).toMatchObject({
      verdict: 'correct',
      counted: true,
    });
    expect(
      checkTaskAnswer(task, task.commonMistakes[0]?.answer ?? ''),
    ).toMatchObject({
      verdict: 'incorrect',
      explanation: task.commonMistakes[0]?.explanation,
    });
  }
  for (const number of [13, 14, 15, 16] as const)
    expect(() => checkTaskAnswer(taskExample(number), '1')).toThrow(TypeError);
  expect(() => checkAnswer({ type: 'integer', value: 'broken' }, '')).toThrow(
    'Эталон',
  );
});

const propertyOptions = { seed: 20261009, numRuns: 500 };
test('property: signs, zero padding and outside whitespace preserve exact integers', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: -(2n ** 256n), max: 2n ** 256n }),
      fc.integer({ min: 0, max: 20 }),
      fc.boolean(),
      (value, padding, plus) => {
        const sign = value < 0n ? '-' : plus ? '+' : '';
        const magnitude = value < 0n ? -value : value;
        const raw = `\u00a0${sign}${'0'.repeat(padding)}${magnitude.toString()}\t`;
        expect(
          checkAnswer({ type: 'integer', value: value.toString() }, raw),
        ).toMatchObject({ verdict: 'correct', normalized: value.toString() });
        expect(
          checkAnswer(
            { type: 'integer', value: value.toString() },
            (value + 1n).toString(),
          ).verdict,
        ).toBe('incorrect');
      },
    ),
    propertyOptions,
  );
});
const digitStrings = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 60 })
  .map((values) => values.join(''));
test('property: sequence spacing preserves order and leading zeros; inserted punctuation is rejected', () => {
  fc.assert(
    fc.property(digitStrings, (value) => {
      const answer = { ...digits, value };
      expect(
        checkAnswer(answer, Array.from(value).join(' \u00a0')),
      ).toMatchObject({ verdict: 'correct', normalized: value });
      expect(checkAnswer(answer, `0${value}`).verdict).toBe('incorrect');
      expect(checkAnswer(answer, `${value},`).verdict).toBe('format_error');
    }),
    propertyOptions,
  );
});
const words = fc
  .array(fc.constantFrom('é', 'ё', 'й', 'а', 'z'), {
    minLength: 1,
    maxLength: 40,
  })
  .map((letters) => letters.join(''));
test('property: NFC and case-insensitive comparison preserve words', () => {
  fc.assert(
    fc.property(words, (value) => {
      expect(
        checkAnswer(
          { type: 'word', value, caseSensitive: false },
          value.toUpperCase().normalize('NFD'),
        ).verdict,
      ).toBe('correct');
      expect(
        checkAnswer(
          { type: 'word', value, caseSensitive: true },
          value.normalize('NFD'),
        ).verdict,
      ).toBe('correct');
      expect(
        checkAnswer(
          { type: 'word', value, caseSensitive: true },
          value.toUpperCase(),
        ).verdict,
      ).toBe('incorrect');
    }),
    propertyOptions,
  );
});
test('property: valid normalization is idempotent', () => {
  const formats: ShortAnswer[] = [
    integer,
    word,
    digits,
    { type: 'sequence', alphabet: 'latin', caseSensitive: false, value: 'Ab' },
  ];
  fc.assert(
    fc.property(fc.string({ maxLength: 80 }), (raw) => {
      for (const format of formats) {
        const first = normalizeAnswer(format, raw);
        if (first.ok)
          expect(normalizeAnswer(format, first.value)).toMatchObject({
            ok: true,
            value: first.value,
            notices: [],
          });
      }
    }),
    propertyOptions,
  );
});
test('property: equivalent wrong integers receive a local mistake explanation', () => {
  fc.assert(
    fc.property(fc.bigInt({ min: 0n, max: 2n ** 128n }), (value) => {
      const wrong = value + 1n;
      const result = checkAnswer(
        { type: 'integer', value: value.toString() },
        `+00${wrong.toString()}`,
        [{ answer: wrong.toString(), explanation: 'Число на единицу больше.' }],
      );
      expect(result).toMatchObject({
        verdict: 'incorrect',
        counted: true,
        explanation: 'Число на единицу больше.',
      });
    }),
    propertyOptions,
  );
});
