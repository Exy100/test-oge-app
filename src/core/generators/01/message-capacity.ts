import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom, bytes as formatBytes, bits } from '../task.ts';

export const messageCapacity: Generator = {
  id: 'message-capacity-v1',
  taskNumber: 1,
  subtype: 'message-capacity',
  title: 'Вместимость сообщения со служебными данными',
  generate(seed) {
    const rng = new Rng(seed);
    const bytes = rng.pick([2, 4]);
    const header = rng.int(5, 15) * bytes;
    const count = rng.int(30, 150);
    const remainder = rng.int(1, bytes - 1);
    const capacity = header + count * bytes + remainder;
    return taskFrom('message-capacity', 1, seed, {
      statement: `Сообщение может занимать не более ${String(capacity)} байт. Из них ${String(header)} байт занимает служебный заголовок. В условной кодировке каждый символ текста занимает ${bits(bytes * 8)}. Какое наибольшее целое число символов можно поместить в сообщение? Других служебных данных нет.`,
      answer: { type: 'integer', value: String(count) },
      solution: [
        {
          text: `Для текста остаётся ${String(capacity)} − ${String(header)} = ${formatBytes(capacity - header)}.`,
        },
        {
          text: `Один символ занимает ${String(bytes * 8)} ÷ 8 = ${formatBytes(bytes)}.`,
        },
        {
          text: `Количество целых символов: ${String(count)}; останется ${formatBytes(remainder)}. Ещё один символ потребовал бы ${formatBytes(header + (count + 1) * bytes)}, больше лимита ${String(capacity)}.`,
        },
      ],
      hints: [
        'Сначала вычти служебный заголовок из лимита.',
        'Переведи размер одного символа из битов в байты.',
        'При делении отбрось остаток: часть символа сохранить нельзя.',
      ],
      commonMistakes: [
        {
          answer: String(Math.floor(capacity / bytes)),
          explanation: 'Ты занял текстом также место служебного заголовка.',
        },
        {
          answer: String(count + 1),
          explanation:
            'Округление вверх нарушает лимит. Нужны только целые символы, которые полностью помещаются.',
        },
      ],
    });
  },
  verify(task) {
    const match =
      /^Сообщение может занимать не более (\d+) байт\. Из них (\d+) байт занимает служебный заголовок\. В условной кодировке каждый символ текста занимает (16|32) бит(?:а)?\./u.exec(
        task.statement,
      );
    if (!match || task.answer.type !== 'integer') return false;
    const count = Number(task.answer.value);
    const capacity = Number(match[1]) * 8;
    const header = Number(match[2]) * 8;
    const width = Number(match[3]);
    return (
      Number.isSafeInteger(count) &&
      count >= 0 &&
      header < capacity &&
      header + count * width <= capacity &&
      header + (count + 1) * width > capacity
    );
  },
};
