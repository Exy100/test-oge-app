import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom, bytes, bits } from '../task.ts';

export const recoding: Generator = {
  id: 'recoding-v1',
  taskNumber: 1,
  subtype: 'recoding',
  title: 'Число символов по изменению кодировки',
  generate(seed) {
    const rng = new Rng(seed);
    const [before, after] = rng.pick([
      [8, 16],
      [8, 32],
      [16, 32],
    ] as const);
    const count = rng.int(20, 240);
    const difference = (after - before) / 8;
    const growth = count * difference;
    return taskFrom('recoding', 1, seed, {
      statement: `Текст перевели из условной кодировки ${bits(before)} на символ в условную кодировку ${bits(after)} на символ. Объём вырос на ${bytes(growth)}. Символы текста не изменились; служебных данных нет. Сколько символов в тексте?`,
      answer: { type: 'integer', value: String(count) },
      solution: [
        {
          text: `Каждый символ стал занимать на ${String(after)} − ${String(before)} = ${bits(after - before)} больше.`,
        },
        {
          text: `Это ${String(after - before)} ÷ 8 = ${bytes(difference)} на символ.`,
        },
        {
          text: `Число символов: ${String(growth)} ÷ ${String(difference)} = ${String(count)}.`,
        },
      ],
      hints: [
        'Найди изменение объёма одного символа.',
        'Переведи разность битов в байты.',
        'Раздели общее увеличение на увеличение для одного символа.',
      ],
      commonMistakes: [
        {
          answer: String(growth / (after - before)),
          explanation:
            'Ты разделил байты на биты. Сначала приведи единицы к одному виду.',
        },
        {
          answer: String(growth / (after / 8)),
          explanation:
            'Задан прирост объёма, а не полный объём после перекодировки. Используй разность размеров символа.',
        },
      ],
    });
  },
  verify(task) {
    const match =
      /^Текст перевели из условной кодировки (8|16) бит(?:а)? на символ в условную кодировку (16|32) бит(?:а)? на символ\. Объём вырос на (\d+) байт(?:а)?\./u.exec(
        task.statement,
      );
    if (!match || task.answer.type !== 'integer') return false;
    const count = Number(task.answer.value);
    if (
      !Number.isSafeInteger(count) ||
      count < 20 ||
      count > 240 ||
      Number(match[2]) <= Number(match[1])
    )
      return false;
    let oldBytes = 0;
    let newBytes = 0;
    for (let index = 0; index < count; index += 1) {
      oldBytes += Number(match[1]) / 8;
      newBytes += Number(match[2]) / 8;
    }
    return newBytes - oldBytes === Number(match[3]);
  },
};
