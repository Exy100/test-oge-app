import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom, bytes, bits as formatBits } from '../task.ts';

const words = ['ёж', 'кот', 'тигр', 'зебра', 'собака', 'дельфин', 'антилопа'];

export const removedWord: Generator = {
  id: 'removed-word-v1',
  taskNumber: 1,
  subtype: 'removed-word',
  title: 'Удалённое слово в списке',
  generate(seed) {
    const rng = new Rng(seed);
    const list = rng.shuffle(words).slice(0, rng.int(4, 7));
    const word = rng.pick(list);
    const bits = rng.pick([8, 16, 32]);
    const removed = ((word.length + 2) * bits) / 8;
    return taskFrom('removed-word', 1, seed, {
      statement: `Условная кодировка: ${formatBits(bits)} на каждый символ. Текст без кавычек: «${list.join(', ')}». Удалили одно слово и ровно одну запятую с одним пробелом. Объём уменьшился на ${bytes(removed)}. Какое слово удалили? Буквы, запятая и пробел занимают одинаковый объём; других изменений нет. Ответ запиши кириллицей, регистр не важен.`,
      answer: { type: 'word', value: word, caseSensitive: false },
      solution: [
        {
          text: `Один символ занимает ${bytes(bits / 8)}. Число удалённых символов: ${String(removed)} ÷ ${String(bits / 8)} = ${String(word.length + 2)}.`,
        },
        {
          text: `Запятая и пробел — ещё два символа. Длина слова: ${String(word.length + 2)} − 2 = ${String(word.length)}.`,
        },
        {
          text: `В списке только слово «${word}» имеет длину ${String(word.length)}. Ответ: ${word}.`,
        },
      ],
      hints: [
        'Переведи объём удалённого фрагмента в число символов.',
        'Кроме букв удалены запятая и пробел.',
        'Вычти два символа и сравни длины слов в списке.',
      ],
      commonMistakes: [
        {
          answer: String(word.length + 2),
          explanation:
            'Это число всех удалённых символов. Нужны буквы слова без запятой и пробела, а в ответе — само слово.',
        },
        {
          answer: String(word.length),
          explanation:
            'Длина найдена, но условие просит записать слово из списка.',
        },
      ],
    });
  },
  verify(task) {
    const match =
      /^Условная кодировка: (8|16|32) бит(?:а)? на каждый символ\. Текст без кавычек: «([а-яё, ]+)»\. Удалили одно слово и ровно одну запятую с одним пробелом\. Объём уменьшился на (\d+) байт(?:а)?\./u.exec(
        task.statement,
      );
    if (!match || task.answer.type !== 'word') return false;
    const list = (match[2] ?? '').split(', ');
    const before = list.join(', ');
    const possible = list.filter((_, index) => {
      const after = list
        .filter((__, position) => position !== index)
        .join(', ');
      return (
        (before.length - after.length) * Number(match[1]) ===
        Number(match[3]) * 8
      );
    });
    return possible.length === 1 && possible[0] === task.answer.value;
  },
};
