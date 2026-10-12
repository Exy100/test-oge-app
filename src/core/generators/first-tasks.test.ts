import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import type { TaskInstance } from '../types';
import { generatorsForTask } from './index';
import { decodings, encode, readCodes } from './02/codes';
import { fixedCode, prefixCode, separatedCode } from './02/decode';
import { missingCode } from './02/missing-code';
import { removedWord } from './01/removed-word';
import { recoding } from './01/recoding';
import { messageCapacity } from './01/message-capacity';

const added = [...generatorsForTask(1), ...generatorsForTask(2)].filter(
  (generator) => generator.subtype !== 'text-volume',
);

function table(task: TaskInstance): Map<string, string> {
  const rows = task.statement
    .split('\n')
    .filter((line) => /^\| [А-ЯЁ] \|/u.test(line));
  return new Map(
    rows.map((row) => {
      const cells = row.split('|').map((cell) => cell.trim());
      return [cells[1] ?? '', cells[2] ?? ''];
    }),
  );
}

function uniqueAnswer(task: TaskInstance): string {
  const numbers = task.statement.match(/\d+/gu)?.map(Number) ?? [];
  if (task.subtype === 'removed-word') {
    const [bits = 0, bytes = 0] = numbers;
    const list = /«([^»]+)»/u.exec(task.statement)?.[1]?.split(', ') ?? [];
    expect(new Set(list.map((word) => word.length)).size).toBe(list.length);
    const candidates = list.filter(
      (word) => ((word.length + 2) * bits) / 8 === bytes,
    );
    expect(candidates).toHaveLength(1);
    return candidates[0] ?? '';
  }
  if (task.subtype === 'recoding') {
    const [oldWidth = 0, newWidth = 0, difference = 0] = numbers;
    const candidates = Array.from({ length: 1025 }, (_, n) => n).filter(
      (n) => n * newWidth === n * oldWidth + difference * 8,
    );
    expect(candidates).toHaveLength(1);
    return String(candidates[0]);
  }
  if (task.subtype === 'message-capacity') {
    const [capacity = 0, header = 0, width = 0] = numbers;
    const fits = Array.from({ length: 1025 }, (_, n) => n).filter(
      (n) => header + (n * width) / 8 <= capacity,
    );
    const max = fits.at(-1);
    expect(max).toBeDefined();
    expect(fits.length).toBeLessThan(1025);
    return String(max);
  }
  const codes = table(task);
  const signal = /Передано: `([^`]+)`/u.exec(task.statement)?.[1] ?? '';
  if (task.subtype === 'missing-code') {
    const message = /Сообщение: «([^»]+)»/u.exec(task.statement)?.[1] ?? '';
    const letters = Array.from(message);
    const count = letters.filter((letter) => codes.get(letter) === '?').length;
    const known = letters.reduce(
      (sum, letter) =>
        sum +
        (codes.get(letter) === '?' ? 0 : (codes.get(letter)?.length ?? 0)),
      0,
    );
    const width = (signal.length - known) / count;
    expect(Number.isInteger(width)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(width).toBeLessThanOrEqual(4);
    let offset = 0;
    const found = new Set<string>();
    for (const letter of letters) {
      const code = codes.get(letter) ?? '';
      const slice = signal.slice(
        offset,
        offset + (code === '?' ? width : code.length),
      );
      if (code === '?') found.add(slice);
      else expect(slice).toBe(code);
      offset += slice.length;
    }
    expect(offset).toBe(signal.length);
    expect(found.size).toBe(1);
    return [...found][0] ?? '';
  }
  if (task.subtype === 'separated-code') {
    const result = signal.split('/').map((chunk) => {
      const matching = [...codes].filter(([, code]) => code === chunk);
      expect(matching).toHaveLength(1);
      return matching[0]?.[0] ?? '';
    });
    return result.join('');
  }
  // Forward exhaustive segmentation, independent of the verifier's suffix DP.
  const solutions: string[] = [];
  function visit(offset: number, text: string): void {
    if (offset === signal.length) {
      solutions.push(text);
      return;
    }
    for (const [letter, code] of codes)
      if (signal.slice(offset, offset + code.length) === code)
        visit(offset + code.length, text + letter);
  }
  visit(0, '');
  expect(solutions).toHaveLength(1);
  return solutions[0] ?? '';
}

for (const generator of added) {
  testGenerator(generator, {
    assertUnique(task) {
      const expected = uniqueAnswer(task);
      expect(task.answer.type).not.toBe('artifact');
      if (task.answer.type !== 'artifact')
        expect(task.answer.value).toBe(expected);
    },
    assertQuality(task) {
      if (task.answer.type === 'artifact')
        throw new Error('Нужен краткий ответ.');
      expect(task.solution.at(-1)?.text).toContain(task.answer.value);
      expect(
        new Set(task.commonMistakes.map((mistake) => mistake.answer)).size,
      ).toBeGreaterThanOrEqual(2);
      if (task.answer.type === 'integer') {
        expect(Number(task.answer.value)).toBeGreaterThan(0);
        expect(Number(task.answer.value)).toBeLessThanOrEqual(1024);
      }
      for (const mistake of task.commonMistakes)
        expect(
          generator.verify({
            ...task,
            answer: { ...task.answer, value: mistake.answer },
          }),
        ).toBe(false);
      if (task.taskNumber === 2) {
        expect(task.statement).toContain('без пробелов');
        if (task.subtype !== 'missing-code')
          expect(task.statement).toContain('кириллических');
      }
    },
  });

  test(`${generator.id}: wrong answers and malformed statements are rejected`, () => {
    const task = generator.generate('negative');
    expect(generator.verify({ ...task, statement: 'Нет параметров.' })).toBe(
      false,
    );
    expect(
      generator.verify({ ...task, answer: { type: 'integer', value: '-1' } }),
    ).toBe(false);
    if (task.answer.type !== 'artifact')
      expect(
        generator.verify({ ...task, answer: { ...task.answer, value: '' } }),
      ).toBe(false);
  });
}

test('removed word: first, middle and last removal include exactly one delimiter', () => {
  const base = removedWord.generate('fixture');
  for (const word of ['кот', 'тигр', 'зебра']) {
    const bytes = (word.length + 2) * 2;
    const task = {
      ...base,
      statement: `Условная кодировка: 16 бит на каждый символ. Текст без кавычек: «кот, тигр, зебра». Удалили одно слово и ровно одну запятую с одним пробелом. Объём уменьшился на ${String(bytes)} байт.`,
      answer: { type: 'word' as const, value: word, caseSensitive: false },
    };
    expect(removedWord.verify(task)).toBe(true);
    expect(
      removedWord.verify({
        ...task,
        statement: task.statement
          .replace('тигр', 'крот')
          .replace('зебра', 'волк'),
      }),
    ).toBe(word === 'кот');
  }
});

test('recoding and capacity enforce exact equations and maximality', () => {
  const changed = recoding.generate('fixture');
  expect(
    recoding.verify({
      ...changed,
      statement: changed.statement.replace(
        /в условную кодировку \d+/u,
        'в условную кодировку 8',
      ),
    }),
  ).toBe(false);
  const capacity = messageCapacity.generate('fixture');
  expect(messageCapacity.verify(capacity)).toBe(true);
  if (capacity.answer.type !== 'integer') throw new Error('Нужен целый ответ.');
  for (const delta of [-1, 1])
    expect(
      messageCapacity.verify({
        ...capacity,
        answer: {
          type: 'integer',
          value: String(Number(capacity.answer.value) + delta),
        },
      }),
    ).toBe(false);
});

test('code verification rejects ambiguous, incomplete and malformed signals', () => {
  const entries = [
    { letter: 'А', code: '0' },
    { letter: 'Б', code: '00' },
  ];
  expect(decodings('00', entries).sort()).toEqual(['АА', 'Б']);
  expect(decodings('01', entries)).toEqual([]);
  expect(decodings('0'.repeat(65), entries)).toEqual([]);
  expect(decodings('', entries)).toEqual([]);
  expect(decodings('0', [{ letter: 'А', code: '' }])).toEqual([]);
  expect(encode('В', entries)).toBeNull();
  const prefix = prefixCode.generate('fixture');
  expect(
    prefixCode.verify({
      ...prefix,
      statement: prefix.statement.replace('| 1111 |', '| 1 |'),
    }),
  ).toBe(false);
  const fixed = fixedCode.generate('fixture');
  expect(
    fixedCode.verify({
      ...fixed,
      statement: fixed.statement.replace('| 000 |', '| 00 |'),
    }),
  ).toBe(false);
  const separated = separatedCode.generate('fixture');
  expect(
    separatedCode.verify({
      ...separated,
      statement: separated.statement.replace('Передано: `', 'Передано: `/'),
    }),
  ).toBe(false);
  expect(
    readCodes('| А | 0 |\n| А | 1 |\n| В | 00 |\n| Г | 11 |', /^[01]+$/u),
  ).toBeNull();
  expect(
    readCodes('| А | 0 |\n| Б | 0 |\n| В | 00 |\n| Г | 11 |', /^[01]+$/u),
  ).toBeNull();
  expect(
    readCodes('| А | 0 |\n| Б | x |\n| В | 00 |\n| Г | 11 |', /^[01]+$/u),
  ).toBeNull();
  expect(readCodes('| А | 0 |', /^[01]+$/u)).toBeNull();
});

test('missing code preserves leading zeroes and checks both occurrences', () => {
  const base = missingCode.generate('fixture');
  const task = {
    ...base,
    statement:
      '| А | ? |\n| К | 01 |\n| М | 10 |\n| О | 110 |\n| Р | 111 |\nСообщение: «КАРАО». Передано: `010011100110`. Восстанови код буквы А.',
    answer: {
      type: 'sequence' as const,
      value: '00',
      alphabet: 'digits' as const,
      caseSensitive: true,
    },
  };
  expect(missingCode.verify(task)).toBe(true);
  expect(
    missingCode.verify({ ...task, answer: { ...task.answer, value: '0' } }),
  ).toBe(false);
  expect(
    missingCode.verify({
      ...task,
      statement: task.statement.replace('010011100110', '010011101110'),
    }),
  ).toBe(false);
  expect(
    missingCode.verify({
      ...task,
      statement: task.statement.replace('буквы А', 'буквы К'),
    }),
  ).toBe(false);
  expect(
    missingCode.verify({
      ...task,
      statement: task.statement.replace('«КАРАО»', '«КОРКО»'),
    }),
  ).toBe(false);
});
