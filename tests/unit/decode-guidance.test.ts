import { expect, test } from 'vitest';
import { buildExamShortTask } from '../../src/core/generators/exam/short-tasks';
import { confirmedShortGenerators } from '../../src/core/generators/exam/short-generators';
import { TaskInstanceSchema } from '../../src/core/schemas';
import { checkTaskAnswer } from '../../src/core/checker';

const codes = { А: '~', Б: '~#', В: '~##', Г: '###' };

function example(message: string) {
  return buildExamShortTask(
    {
      problem: {
        kind: 'decode',
        codes,
        encoded: Array.from(
          message,
          (letter) => codes[letter as keyof typeof codes],
        ).join(''),
      },
      message,
      answer: {
        type: 'sequence',
        value: message,
        alphabet: 'cyrillic',
        caseSensitive: false,
      },
    },
    'readable-explanation',
  );
}

test('short code can be correct: explains why both longer matches fail', () => {
  const task = example('АГ');
  const explanation = task.solution[0]?.text ?? '';
  expect(explanation).toContain('Если выбрать букву «Б» (код `~#`)');
  expect(explanation).toContain('Остаётся `##` (с позиции 3)');
  expect(explanation).toContain('Если выбрать букву «В» (код `~##`)');
  expect(explanation).toContain('Остаётся `#` (с позиции 4)');
  expect(explanation).toContain('Берём код `~` — это буква «А»');
  expect(task.solution[1]?.text).toContain('`~ / ###`');
  expect(checkTaskAnswer(task, 'АГ').verdict).toBe('correct');
});

test('long code can be correct: follows a shorter match through another code to the dead end', () => {
  const task = example('ВГ');
  expect(task.solution[0]?.text).toContain(
    'После `###` остаётся `##` (с позиции 5)',
  );
  expect(task.solution[0]?.text).toContain(
    'После `###` остаётся `#` (с позиции 6)',
  );
  expect(task.solution[0]?.text).toContain('Берём код `~##` — это буква «В»');
  expect(task.solution[1]?.text).toContain('`~## / ###`');
});

test('points to the actual fork after an unambiguous first letter', () => {
  const task = example('ГАГ');
  expect(task.hints[1]).toContain('с позиции 4: `~###`');
  expect(task.solution[0]?.text).toContain('С позиции 4 записано `~###`');
  expect(task.solution[1]?.text).toContain('`### / ~ / ###`');
});

test('does not invent a fork when overlapping codes have only one match in this signal', () => {
  const task = example('ГА');
  expect(task.hints.join('\n')).not.toContain('Если выбрать');
  expect(task.solution[0]?.text).not.toContain('Берём код');
  expect(task.solution[1]?.text).toContain('`### / ~`');
});

test('repeated letters are counted in decoded groups, with each answer letter written once', () => {
  const message = 'АБАВБГ';
  const entries: Record<string, string> = {
    А: '...',
    Б: '..o',
    В: '.o.',
    Г: '.oo',
  };
  const task = buildExamShortTask(
    {
      problem: {
        kind: 'decode',
        codes: entries,
        encoded: Array.from(message, (letter) => entries[letter]).join(''),
        repeatedOnly: true,
      },
      message,
      answer: {
        type: 'sequence',
        value: 'АБ',
        alternatives: ['БА'],
        alphabet: 'cyrillic',
        caseSensitive: false,
      },
    },
    'repeated-example',
  );
  expect(task.hints[0]).toContain('по 3 знака');
  expect(task.hints[2]).toContain('«А» встречается 2 раза');
  expect(task.solution[2]?.text).toContain(
    '«А» — 2 раза; «Б» — 2 раза; «В» — 1 раз; «Г» — 1 раз',
  );
  expect(checkTaskAnswer(task, 'БА').verdict).toBe('correct');
  expect(checkTaskAnswer(task, 'АБА').verdict).toBe('incorrect');
});

test('all live decoding formats explain the actual groups without changing answers or replay identity', () => {
  for (const generator of confirmedShortGenerators.filter(
    (entry) => entry.taskNumber === 2,
  )) {
    for (let index = 0; index < 32; index++) {
      const task = TaskInstanceSchema.parse(
        generator.generate(`editorial:${String(index)}`),
      );
      expect(generator.verify(task)).toBe(true);
      const rows = task.solution[1]?.text.matchAll(
        /^\| \d+ \| `([^`]+)` \| ([А-ЯЁ]) \|$/gmu,
      );
      const groups = [...(rows ?? [])];
      expect(groups.length).toBeGreaterThanOrEqual(5);
      const encoded = /Сигнал: `([^`]+)`/u.exec(task.statement)?.[1];
      expect(groups.map((row) => row[1]).join('')).toBe(encoded);
      const decoded = groups.map((row) => row[2]).join('');
      const expected =
        task.subtype === 'decode-repeated'
          ? [
              ...new Set(
                Array.from(decoded).filter(
                  (letter) =>
                    decoded.indexOf(letter) !== decoded.lastIndexOf(letter),
                ),
              ),
            ]
              .sort()
              .join('')
          : decoded;
      expect(checkTaskAnswer(task, expected).verdict).toBe('correct');
      expect(task.solution[2]?.text).toContain(`**${expected}**`);
    }
  }
});
