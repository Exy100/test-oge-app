import { Rng } from '../../core/rng';
import { removeListedWord, textVolume } from './information';

export interface MemoryProblem {
  words: readonly string[];
  bits: number;
  word: string;
  removedIndex: number;
  before: string;
  after: string;
  bytes: number;
  bytesPerSymbol: number;
  symbols: number;
  letters: number;
}

const lists = [
  ['дуб', 'клён', 'сосна', 'берёза'],
  ['ёж', 'лев', 'тигр', 'зебра', 'собака'],
  ['киви', 'лимон', 'яблоко', 'абрикос'],
  ['мак', 'роза', 'астра', 'фиалка', 'ромашка'],
] as const;

/** Author-written examples of the same fixed-width deletion model as ОГЭ №1. */
export function memoryProblem(index: number): MemoryProblem {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('Номер варианта должен быть неотрицательным целым.');
  const rng = new Rng(`memory-lab:${String(index)}`);
  const words =
    index === 0
      ? lists[0]
      : rng.shuffle(lists[index % lists.length] ?? lists[0]);
  const removedIndex = index === 0 ? 2 : rng.int(0, words.length - 1);
  const word = words[removedIndex];
  if (!word) throw new RangeError('Не найдено слово для удаления.');
  const bits = index === 0 ? 16 : rng.pick([8, 16]);
  const before = words.join(', ');
  const after = removeListedWord(words, removedIndex);
  const bytes = textVolume(before, bits).bytes - textVolume(after, bits).bytes;
  return {
    words,
    bits,
    word,
    removedIndex,
    before,
    after,
    bytes,
    bytesPerSymbol: bits / 8,
    symbols: bytes / (bits / 8),
    letters: Array.from(word).length,
  };
}

export function checkMemoryAnswer(
  problem: MemoryProblem,
  step: number,
  value: string,
) {
  const answer = value.trim().toLocaleLowerCase('ru');
  if (step === 3) {
    return {
      correct: answer === problem.word,
      message:
        answer === problem.word
          ? 'Верно! Проверим удаление в исходной строке.'
          : 'Это слово не подходит. Раздели уменьшение объёма на размер символа и учти запятую с пробелом.',
    };
  }
  const expected = [problem.bytesPerSymbol, problem.symbols, problem.letters][
    step
  ];
  if (expected === undefined) throw new RangeError('Неизвестный шаг решения.');
  const correct = /^\d+$/u.test(answer) && Number(answer) === expected;
  let message = 'Введи целое неотрицательное число.';
  if (/^\d+$/u.test(answer)) {
    message =
      [
        `В одном байте 8 бит. Раздели ${String(problem.bits)} на 8.`,
        `Один символ занимает ${String(problem.bytesPerSymbol)} байт. Раздели ${String(problem.bytes)} на это число.`,
        Number(answer) === problem.symbols
          ? 'Ты посчитал все символы. Запятая и пробел — ещё два символа, которые не входят в слово.'
          : Number(answer) === problem.symbols - 1
            ? 'Учтён только один разделитель. Вместе со словом удалены и запятая, и пробел.'
            : 'Вычти два разделителя из общего числа удалённых символов.',
      ][step] ?? message;
  }
  return {
    correct,
    message: correct ? 'Верно. Переходим к следующему шагу.' : message,
  };
}

/** Keep the original order, including the separator BEFORE a final word. */
export function memoryTokens(problem: MemoryProblem) {
  const start =
    problem.words.slice(0, problem.removedIndex).join(', ').length +
    (problem.removedIndex === 0 ? 0 : 2);
  const last = problem.removedIndex === problem.words.length - 1;
  const from = last ? start - 2 : start;
  const to = last ? start + problem.letters : start + problem.letters + 2;
  return Array.from(problem.before, (character, index) => ({
    character,
    removed: index >= from && index < to,
  }));
}
