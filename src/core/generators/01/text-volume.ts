import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';

export const textVolume: Generator = {
  id: 'text-volume-v1',
  taskNumber: 1,
  subtype: 'text-volume',
  title: 'Объём текста в условной кодировке',
  generate(seed) {
    const rng = new Rng(seed);
    const count = rng.int(16, 256);
    const bits = rng.int(1, 4) * 8;
    const total = count * bits;
    const answer = total / 8;
    return {
      id: `text-volume-v1:${seed}`,
      generatorId: 'text-volume-v1',
      seed,
      taskNumber: 1,
      examPart: 1,
      subtype: 'text-volume',
      difficulty: 1,
      topics: ['Объём информации'],
      statement: `Используется условная кодировка. Размер символа: ${String(bits)} бит. Количество символов: ${String(count)}. Сколько байт занимает текст? Учитывай только символы, без служебных данных.`,
      answer: { type: 'integer', value: String(answer) },
      solution: [
        {
          text: `Количество символов: ${String(count)}. Размер каждого: ${String(bits)} бит.`,
        },
        {
          text: `Общий объём: ${String(count)} × ${String(bits)} = ${String(total)} бит.`,
        },
        {
          text: `В байте 8 бит: ${String(total)} ÷ 8 = ${String(answer)} байт.`,
        },
      ],
      hints: [
        'Найди общий объём в битах.',
        'Умножь количество символов на число бит в одном символе.',
        'Переведи биты в байты: раздели на 8.',
      ],
      commonMistakes: [
        {
          answer: String(total),
          explanation: 'Это объём в битах. В ответе нужны байты.',
        },
        {
          answer: String(total * 8),
          explanation: 'При переводе битов в байты нужно делить на 8.',
        },
      ],
    };
  },
  verify(task) {
    const match =
      /^Используется условная кодировка\. Размер символа: (\d+) бит\. Количество символов: (\d+)\./u.exec(
        task.statement,
      );
    if (!match?.[1] || !match[2] || task.answer.type !== 'integer')
      return false;
    const width = Number(match[1]);
    const count = Number(match[2]);
    if (width % 8 !== 0 || width < 8 || width > 32 || count < 16 || count > 256)
      return false;
    // Independent accumulation in bytes, instead of multiplying the bit volume.
    let bytes = 0;
    for (let index = 0; index < count; index += 1) bytes += width / 8;
    return String(bytes) === task.answer.value;
  },
};
