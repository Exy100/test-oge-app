export const practiceTopics = [
  {
    id: 'volume',
    number: 1,
    title: 'Объём текста',
    description: 'Биты, байты и символы',
    mark: 'Aa',
  },
  {
    id: 'logic',
    number: 3,
    title: 'Логика',
    description: 'Условия и верные значения',
    mark: '&',
  },
  {
    id: 'binary',
    number: 10,
    title: 'Системы счисления',
    description: 'Из двоичной в десятичную',
    mark: '01',
  },
] as const;

export type PracticeTopic = (typeof practiceTopics)[number]['id'];
interface TaskBase {
  id: string;
  question: string;
  answer: number;
  hints: [string, string, string];
  steps: [string, string, string];
}
export type PracticeTask = TaskBase &
  (
    | { topic: 'volume'; characters: number; bits: number }
    | {
        topic: 'logic';
        lower: number;
        upper: number;
        lowerInclusive: boolean;
        upperInclusive: boolean;
        find: 'min' | 'max';
      }
    | { topic: 'binary'; decimal: number; digits: string }
  );

const characters = [24, 36, 48, 64, 80, 96, 120, 160];
const bitWidths = [16, 8, 32];
const lowerBounds = [3, 5, 8, 11, 14, 17, 21, 25];
const decimalValues = [13, 19, 22, 27, 34, 41, 46, 53, 58, 61, 75, 85];

function select(values: readonly number[], index: number): number {
  const value = values[index % values.length];
  if (value === undefined) throw new RangeError('Нет значения для задачи.');
  return value;
}

export function practiceSize(topic: PracticeTopic): number {
  if (topic === 'volume') return characters.length * bitWidths.length;
  if (topic === 'logic') return lowerBounds.length * 4;
  return decimalValues.length;
}

export function binaryPlaces(
  digits: string,
): { digit: string; weight: number }[] {
  return Array.from(digits, (digit, index) => ({
    digit,
    weight: 2 ** (digits.length - index - 1),
  }));
}

export function makePracticeTask(
  topic: PracticeTopic,
  index: number,
): PracticeTask {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('Номер задачи должен быть неотрицательным целым.');
  const position = index % practiceSize(topic);
  const id = `${topic}-${String(position)}`;
  if (topic === 'volume') {
    const count = select(characters, position);
    const bits = select(bitWidths, Math.floor(position / characters.length));
    const totalBits = count * bits;
    const answer = totalBits / 8;
    return {
      id,
      topic,
      characters: count,
      bits,
      answer,
      question: `В некоторой кодировке каждый символ занимает ${String(bits)} бит. Сколько байт памяти занимает текст из ${String(count)} символов? Считай только сами символы.`,
      hints: [
        'Сначала найди объём всех символов в битах.',
        `Умножь количество символов на ${String(bits)} бит.`,
        'В одном байте 8 бит. Раздели общий объём в битах на 8.',
      ],
      steps: [
        `Один символ занимает ${String(bits)} бит, символов — ${String(count)}.`,
        `Объём текста: ${String(count)} × ${String(bits)} = ${String(totalBits)} бит.`,
        `Переводим в байты: ${String(totalBits)} ÷ 8 = ${String(answer)} байт.`,
      ],
    };
  }
  if (topic === 'logic') {
    const lower = select(lowerBounds, position);
    const upper = lower + 4 + (position % 3);
    const mode = Math.floor(position / lowerBounds.length);
    const lowerInclusive = mode >= 2;
    const upperInclusive = mode % 2 === 1;
    const find = mode % 2 === 0 ? 'min' : 'max';
    const first = lowerInclusive
      ? `НЕ (X < ${String(lower)})`
      : `(X > ${String(lower)})`;
    const second = `(X ${upperInclusive ? '≤' : '<'} ${String(upper)})`;
    const answer =
      find === 'min'
        ? lower + (lowerInclusive ? 0 : 1)
        : upper - (upperInclusive ? 0 : 1);
    return {
      id,
      topic,
      lower,
      upper,
      lowerInclusive,
      upperInclusive,
      find,
      answer,
      question: `Найди ${find === 'min' ? 'наименьшее' : 'наибольшее'} целое число X, при котором истинно выражение: ${first} И ${second}.`,
      hints: [
        'Связка «И» означает, что оба условия должны выполняться одновременно.',
        lowerInclusive
          ? `НЕ (X < ${String(lower)}) означает X ≥ ${String(lower)}.`
          : `X > ${String(lower)}: первое подходящее целое — ${String(lower + 1)}.`,
        `Посмотри на ${find === 'min' ? 'левую' : 'правую'} границу. Строгое неравенство не включает само граничное число.`,
      ],
      steps: [
        `Первое условие: X ${lowerInclusive ? '≥' : '>'} ${String(lower)}.`,
        `Вместе со вторым условием получаем ${String(lower)} ${lowerInclusive ? '≤' : '<'} X ${upperInclusive ? '≤' : '<'} ${String(upper)}.`,
        `${find === 'min' ? 'Наименьшее' : 'Наибольшее'} целое число в этом диапазоне — ${String(answer)}. Оно удовлетворяет обоим условиям.`,
      ],
    };
  }
  const decimal = select(decimalValues, position);
  const digits = decimal.toString(2);
  const places = binaryPlaces(digits);
  const terms = places
    .filter((place) => place.digit === '1')
    .map((place) => place.weight);
  return {
    id,
    topic: 'binary',
    decimal,
    digits,
    answer: decimal,
    question: `Переведи число ${digits} из двоичной системы счисления в десятичную.`,
    hints: [
      'У крайнего правого разряда вес 1. Каждый разряд слева вдвое больше предыдущего.',
      `Веса разрядов слева направо: ${places.map((place) => place.weight).join(', ')}.`,
      'Сложи только те веса, над которыми стоит цифра 1.',
    ],
    steps: [
      `Записываем веса разрядов: ${places.map((place) => place.weight).join(', ')}.`,
      `Нулевые разряды не вносят вклад. Берём ${terms.join(', ')}.`,
      `Складываем: ${terms.join(' + ')} = ${String(decimal)}. Это запись числа в десятичной системе.`,
    ],
  };
}

export function checkPracticeAnswer(
  task: PracticeTask,
  raw: string,
): 'invalid' | 'correct' | 'incorrect' {
  const value = raw.trim();
  if (value.length > 32 || !/^[+-]?\d+$/u.test(value)) return 'invalid';
  return BigInt(value) === BigInt(task.answer) ? 'correct' : 'incorrect';
}
