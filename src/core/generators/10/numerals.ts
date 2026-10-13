import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind =
  'radix-to-decimal' | 'radix-from-decimal' | 'binary-ones' | 'radix-compare';
const titles: Record<Kind, string> = {
  'radix-to-decimal': 'Перевод в десятичную систему',
  'radix-from-decimal': 'Перевод из десятичной системы',
  'binary-ones': 'Единицы в двоичной записи',
  'radix-compare': 'Сравнение чисел в разных системах',
};
const digits = '0123456789ABCDEF';
function valueOf(text: string, base: number): number | null {
  if (![2, 8, 16].includes(base) || !/^[1-9A-F][0-9A-F]{0,10}$/u.test(text))
    return null;
  let result = 0;
  for (const character of text) {
    const digit = digits.indexOf(character);
    if (digit >= base) return null;
    result = result * base + digit;
  }
  return result <= 65535 ? result : null;
}
function numeral(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 10,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const n = rng.int(17, 511);
      let statement: string;
      let answer: string;
      let steps: string[];
      let hints: [string, string, string];
      let mistakes: string[];
      if (kind === 'radix-to-decimal') {
        const base = rng.pick([2, 8, 16]);
        const source = n.toString(base).toUpperCase();
        answer = String(n);
        statement = `Число \`${source}\` записано в системе счисления с основанием ${String(base)}. Переведи его в десятичную систему. Ответ запиши целым числом.`;
        const terms = Array.from(source).map(
          (digit, i) =>
            `${String(digits.indexOf(digit))} × ${String(base)}^${String(source.length - i - 1)}`,
        );
        steps = [
          `Разряды справа налево имеют веса 1, ${String(base)}, ${String(base ** 2)} и далее. Буквы A–F обозначают значения 10–15.`,
          `Разложение по разрядам: ${terms.join(' + ')}.`,
          `Сумма разрядных слагаемых равна ${answer}. Ответ: ${answer}.`,
        ];
        hints = [
          'Основание определяет вес соседних разрядов.',
          'Крайний правый разряд имеет степень 0.',
          'Умножь значение каждой цифры на вес её разряда и сложи.',
        ];
        mistakes = [
          String(n * base),
          String(
            Array.from(source).reduce(
              (sum, digit) => sum + digits.indexOf(digit),
              0,
            ),
          ),
        ];
      } else if (kind === 'radix-from-decimal') {
        const base = rng.pick([2, 8]);
        answer = n.toString(base);
        statement = `Десятичное число ${String(n)} переведи в систему счисления с основанием ${String(base)}. Ответ запиши последовательностью цифр без пробелов и ведущих нулей.`;
        const divisions: string[] = [];
        let current = n;
        while (current > 0) {
          divisions.push(
            `${String(current)} = ${String(Math.floor(current / base))} × ${String(base)} + ${String(current % base)}`,
          );
          current = Math.floor(current / base);
        }
        steps = [
          `Последовательно дели число на ${String(base)}, сохраняя остатки.`,
          divisions.join('; ') + '.',
          `Читай остатки от последнего к первому: ${answer}. Ответ: ${answer}.`,
        ];
        hints = [
          'Дели частное на основание, пока оно не станет нулём.',
          'Каждый остаток меньше основания.',
          'Первый полученный остаток — крайняя правая цифра ответа.',
        ];
        mistakes = ['0' + answer, answer.slice(1)];
      } else if (kind === 'binary-ones') {
        const add = rng.int(1, 31);
        const sum = n + add;
        const binary = sum.toString(2);
        answer = String(
          Array.from(binary).filter((digit) => digit === '1').length,
        );
        statement = `Вычисли сумму десятичных чисел ${String(n)} и ${String(add)}. Сколько цифр 1 содержит двоичная запись результата? Ответ запиши целым числом.`;
        steps = [
          `Сумма в десятичной системе: ${String(n)} + ${String(add)} = ${String(sum)}.`,
          `Двоичная запись суммы: ${binary}.`,
          `Посчитай единицы в этой записи: ${answer}. Ответ: ${answer}.`,
        ];
        hints = [
          'Сначала выполни сложение в десятичной системе.',
          'Переведи сумму в двоичную систему.',
          'Нужны единицы, а не длина записи и не само число.',
        ];
        mistakes = [String(sum), String(Number(answer) + 1)];
      } else {
        const values = rng.shuffle([
          n,
          n + rng.int(1, 20),
          n + rng.int(21, 50),
        ]);
        const bases = rng.shuffle([2, 8, 16]);
        const rows = values.map((value, i) => ({
          value,
          base: bases[i] ?? 2,
          source: value.toString(bases[i] ?? 2).toUpperCase(),
        }));
        answer = String(Math.max(...values));
        statement = `Даны три числа в разных системах счисления.\n\n| Запись | Основание |\n| --- | --- |\n${rows.map((row) => `| \`${row.source}\` | ${String(row.base)} |`).join('\n')}\n\nНайди наибольшее число. Ответ запиши в десятичной системе целым числом.`;
        steps = [
          'Сравнивать длины записей в разных основаниях нельзя: переведи числа в одну систему.',
          rows
            .map(
              (row) =>
                `${row.source} (основание ${String(row.base)}) = ${String(row.value)} (основание 10)`,
            )
            .join('; ') + '.',
          `Наибольшее из ${values.map(String).join(', ')} — ${answer}. Ответ: ${answer}.`,
        ];
        hints = [
          'Начни с определения основания каждой строки.',
          'При переводе учитывай вес каждой цифры, а для A–F значения 10–15.',
          'Выбери максимум десятичных значений, а не самую длинную запись.',
        ];
        mistakes = values
          .filter((value) => String(value) !== answer)
          .map(String);
      }
      return taskFrom(kind, 10, seed, {
        statement,
        answer:
          kind === 'radix-from-decimal'
            ? {
                type: 'sequence',
                value: answer,
                alphabet: 'digits',
                caseSensitive: true,
              }
            : { type: 'integer', value: answer },
        solution: steps.map((text) => ({ text })),
        hints,
        commonMistakes: mistakes.map((value, i) => ({
          answer: value,
          explanation:
            kind === 'radix-from-decimal'
              ? i === 0
                ? 'Условие запрещает ведущие нули. Запиши каноническую запись числа.'
                : 'Пропущен старший разряд.'
              : kind === 'radix-to-decimal'
                ? i === 0
                  ? 'Нумерация разрядов ошибочно начата с 1 вместо 0.'
                  : 'Сложены цифры без учёта их разрядных весов.'
                : kind === 'binary-ones'
                  ? i === 0
                    ? 'Это значение суммы, а не количество единиц.'
                    : 'Посчитана лишняя единица. Проверь каждую цифру двоичной записи.'
                  : 'Выбрано число, которое меньше максимума после перевода в десятичную систему.',
        })),
      });
    },
    verify(task) {
      if (kind === 'radix-from-decimal') {
        const match =
          /^Десятичное число (\d+) переведи в систему счисления с основанием (2|8)\./u.exec(
            task.statement,
          );
        if (!match || task.answer.type !== 'sequence') return false;
        const value = Number(match[1]);
        return (
          value >= 17 &&
          value <= 511 &&
          valueOf(task.answer.value, Number(match[2])) === value
        );
      }
      if (task.answer.type !== 'integer') return false;
      let expected: number | null;
      if (kind === 'radix-to-decimal') {
        const match =
          /^Число `([0-9A-F]+)` записано в системе счисления с основанием (2|8|16)\. Переведи его в десятичную систему\./u.exec(
            task.statement,
          );
        if (!match) return false;
        expected = valueOf(match[1] ?? '', Number(match[2]));
      } else if (kind === 'binary-ones') {
        const match =
          /^Вычисли сумму десятичных чисел (\d+) и (\d+)\. Сколько цифр 1 содержит двоичная запись результата\?/u.exec(
            task.statement,
          );
        if (
          !match ||
          Number(match[1]) < 17 ||
          Number(match[1]) > 511 ||
          Number(match[2]) < 1 ||
          Number(match[2]) > 31
        )
          return false;
        let value = Number(match[1]) + Number(match[2]);
        expected = 0;
        while (value) {
          value &= value - 1;
          expected++;
        }
      } else {
        if (
          !task.statement.endsWith(
            'Найди наибольшее число. Ответ запиши в десятичной системе целым числом.',
          )
        )
          return false;
        const rows = [
          ...task.statement.matchAll(/^\| `([0-9A-F]+)` \| (2|8|16) \|$/gmu),
        ];
        if (rows.length !== 3 || new Set(rows.map((row) => row[2])).size !== 3)
          return false;
        const values = rows.map((row) => valueOf(row[1] ?? '', Number(row[2])));
        if (values.some((value) => value === null)) return false;
        expected = Math.max(...values.map((value) => value ?? 0));
      }
      return expected !== null && String(expected) === task.answer.value;
    },
  };
}
export const radixToDecimal = numeral('radix-to-decimal');
export const radixFromDecimal = numeral('radix-from-decimal');
export const binaryOnes = numeral('binary-ones');
export const radixCompare = numeral('radix-compare');
