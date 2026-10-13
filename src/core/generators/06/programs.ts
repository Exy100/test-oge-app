import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind =
  'program-assign' | 'program-branch' | 'program-for' | 'program-while';
const titles: Record<Kind, string> = {
  'program-assign': 'Последовательные присваивания',
  'program-branch': 'Результаты нескольких запусков ветвления',
  'program-for': 'Накопление суммы в цикле for',
  'program-while': 'Обработка цифр в цикле while',
};
const assignment =
  'x = int(input())\ny = int(input())\nx = x + y\ny = x - y\nx = x * y\nprint(x)';
const branch = (a: number, b: number, op: string) =>
  `s = int(input())\nt = int(input())\nif s > ${String(a)} ${op} t < ${String(b)}:\n    print("ДА")\nelse:\n    print("НЕТ")`;
const forLoop = (divisor: number) =>
  `n = int(input())\ns = 0\nfor i in range(1, n + 1):\n    if i % ${String(divisor)} == 0:\n        s = s + i\nprint(s)`;
const whileLoop = (threshold: number) =>
  `n = int(input())\ns = 0\nwhile n > 0:\n    digit = n % 10\n    if digit >= ${String(threshold)}:\n        s = s + digit\n    n = n // 10\nprint(s)`;

function program(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 6,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      let code: string;
      let data: string;
      let result: number;
      let steps: string[];
      let hints: [string, string, string];
      let mistakes: { answer: string; explanation: string }[];
      if (kind === 'program-assign') {
        const a = rng.int(4, 12);
        const b = rng.int(1, 3);
        code = assignment;
        data = `Ввод: \`${String(a)} ${String(b)}\`.`;
        result = (a + b) * a;
        steps = [
          `После ввода x = ${String(a)}, y = ${String(b)}. После x = x + y: x = ${String(a + b)}, y = ${String(b)}.`,
          `В строке y = x - y используется уже новое x: y = ${String(a + b)} − ${String(b)} = ${String(a)}.`,
          `Последнее присваивание даёт x = ${String(a + b)} × ${String(a)} = ${String(result)}. Программа выводит ${String(result)}.`,
        ];
        hints = [
          'Записывай значения обеих переменных после каждой строки.',
          'Присваивания выполняются последовательно, а не одновременно.',
          'В последнем умножении используй обновлённые x и y.',
        ];
        mistakes = [
          {
            answer: String((a + b) * (a - b)),
            explanation:
              'При вычислении y использовано старое x. Предыдущее присваивание уже изменило его.',
          },
          {
            answer: String(a * b),
            explanation:
              'Перемножены исходные данные без выполнения присваиваний.',
          },
        ];
      } else if (kind === 'program-branch') {
        const a = rng.int(3, 9);
        const b = rng.int(3, 9);
        const and = rng.chance(0.5);
        const pairs = rng.shuffle([
          [a, b],
          [a + 1, b - 1],
          [a - 1, b + 1],
          ...Array.from({ length: 7 }, () => [
            rng.int(a - 2, a + 2),
            rng.int(b - 2, b + 2),
          ]),
        ]);
        const yes = pairs.map(([s = 0, t = 0]) =>
          and ? s > a && t < b : s > a || t < b,
        );
        result = yes.filter(Boolean).length;
        code = branch(a, b, and ? 'and' : 'or');
        data = [
          'В каждом запуске вводилась отдельная пара (s, t):',
          '| Запуск | s | t |',
          '| --- | --- | --- |',
          ...pairs.map(
            ([s, t], index) =>
              `| ${String(index + 1)} | ${String(s)} | ${String(t)} |`,
          ),
        ].join('\n');
        steps = [
          `Для каждой пары проверь s > ${String(a)} и t < ${String(b)}. Равенство границе не удовлетворяет строгому сравнению.`,
          `Результаты по порядку запусков: ${yes.map((value, index) => `${String(index + 1)}: ${value ? 'ДА' : 'НЕТ'}`).join('; ')}.`,
          `Количество запусков с ответом ДА: ${String(result)}.`,
        ];
        hints = [
          'Не переноси значения переменных между отдельными запусками.',
          and
            ? 'and требует истинности обоих сравнений.'
            : 'or требует истинности хотя бы одного сравнения.',
          'Отдельно проверь пары с равенством границе и посчитай только ДА.',
        ];
        const inclusive = pairs.filter(([s = 0, t = 0]) =>
          and ? s >= a && t <= b : s >= a || t <= b,
        ).length;
        mistakes = [
          {
            answer: String(inclusive),
            explanation: 'Строгие сравнения ошибочно заменены на нестрогие.',
          },
          {
            answer: String(pairs.length),
            explanation:
              'Это число всех запусков. Засчитываются только запуски с выводом ДА.',
          },
        ];
      } else if (kind === 'program-for') {
        const divisor = rng.int(2, 5);
        const count = rng.int(3, 7);
        const n = divisor * count;
        result = (divisor * count * (count + 1)) / 2;
        code = forLoop(divisor);
        data = `Ввод: \`${String(n)}\`.`;
        const values = Array.from(
          { length: count },
          (_, index) => divisor * (index + 1),
        );
        steps = [
          `range(1, n + 1) перебирает целые от 1 до ${String(n)} включительно.`,
          `Условие i % ${String(divisor)} == 0 пропускает в сумму только ${values.map(String).join(', ')}.`,
          `Сумма: ${values.map(String).join(' + ')} = ${String(result)}. Вывод: ${String(result)}.`,
        ];
        hints = [
          'Верхняя граница range не включается: здесь она равна n + 1.',
          'Оператор % даёт остаток от деления.',
          'Суммируй значения i, прошедшие условие, а не число итераций.',
        ];
        mistakes = [
          {
            answer: String(result - n),
            explanation:
              'Последнее значение n ошибочно исключено из range(1, n + 1).',
          },
          {
            answer: String((n * (n + 1)) / 2),
            explanation:
              'Просуммированы все значения i без проверки делимости.',
          },
        ];
      } else {
        const threshold = rng.int(2, 6);
        const digits = rng.shuffle([
          0,
          threshold - 1,
          threshold,
          threshold + 1,
          rng.int(0, 9),
        ]);
        if (digits[0] === 0) {
          const first = digits.findIndex((digit) => digit > 0);
          const value = digits[first] ?? 1;
          digits[first] = 0;
          digits[0] = value;
        }
        const n = Number(digits.join(''));
        result = digits
          .filter((digit) => digit >= threshold)
          .reduce((sum, digit) => sum + digit, 0);
        code = whileLoop(threshold);
        data = `Ввод: \`${String(n)}\`.`;
        steps = [
          `n % 10 извлекает последнюю цифру, n // 10 удаляет её. Порядок обработки: ${digits.toReversed().map(String).join(', ')}.`,
          `В сумму входят цифры не меньше ${String(threshold)}: ${digits
            .filter((digit) => digit >= threshold)
            .map(String)
            .join(', ')}.`,
          `Сумма выбранных цифр: ${String(result)}. При n = 0 цикл заканчивается; вывод: ${String(result)}.`,
        ];
        hints = [
          'Начни с правой цифры числа.',
          'Условие >= включает цифру, равную порогу.',
          'Ноль внутри записи числа не завершает цикл: проверяется всё оставшееся n.',
        ];
        mistakes = [
          {
            answer: String(digits.reduce((sum, digit) => sum + digit, 0)),
            explanation: 'Просуммированы все цифры без условия отбора.',
          },
          {
            answer: String(
              digits
                .filter((digit) => digit > threshold)
                .reduce((sum, digit) => sum + digit, 0),
            ),
            explanation:
              'Условие >= заменено на >, и цифры, равные порогу, потеряны.',
          },
        ];
      }
      return taskFrom(kind, 6, seed, {
        statement: `Выполняется программа на Python 3. Числа ввода подаются по одному на строку.\n\n\`\`\`python\n${code}\n\`\`\`\n\n${data}\n\n${kind === 'program-branch' ? 'Сколько запусков напечатали ДА?' : 'Какое целое число напечатает программа?'}`,
        answer: { type: 'integer', value: String(result) },
        solution: steps.map((text) => ({ text })),
        hints,
        commonMistakes: mistakes,
      });
    },
    verify(task) {
      if (task.answer.type !== 'integer') return false;
      const code = /```python\n([^]*?)\n```/u.exec(task.statement)?.[1];
      if (!code) return false;
      let expected = 0;
      if (kind === 'program-branch') {
        const condition = /if s > ([3-9]) (and|or) t < ([3-9]):/u.exec(code);
        if (!condition) return false;
        const a = Number(condition[1]);
        const b = Number(condition[3]);
        const op = condition[2] ?? '';
        if (code !== branch(a, b, op)) return false;
        const pairs = [
          ...task.statement.matchAll(/^\| (\d+) \| (\d+) \| (\d+) \|$/gmu),
        ];
        if (pairs.length !== 10) return false;
        for (const [index, pair] of pairs.entries()) {
          const s = Number(pair[2]);
          const t = Number(pair[3]);
          if (Number(pair[1]) !== index + 1 || s > 20 || t > 20) return false;
          if (op === 'and' ? !(s <= a || t >= b) : !(s <= a && t >= b))
            expected += 1;
        }
      } else {
        const input = /Ввод: `([0-9 ]+)`\./u
          .exec(task.statement)?.[1]
          ?.split(' ')
          .map(Number);
        if (
          !input ||
          input.some(
            (value) =>
              !Number.isSafeInteger(value) || value < 1 || value > 99999,
          )
        )
          return false;
        if (kind === 'program-assign') {
          if (code !== assignment || input.length !== 2) return false;
          let [x = 0, y = 0] = input;
          x += y;
          y = x - y;
          x *= y;
          expected = x;
        } else if (kind === 'program-for') {
          const divisor = Number(/i % ([2-5]) == 0/u.exec(code)?.[1]);
          if (
            code !== forLoop(divisor) ||
            input.length !== 1 ||
            (input[0] ?? 0) > 100
          )
            return false;
          for (let i = 1; i <= (input[0] ?? 0); i += 1)
            if (i % divisor === 0) expected += i;
        } else {
          const threshold = Number(/digit >= ([2-6])/u.exec(code)?.[1]);
          if (code !== whileLoop(threshold) || input.length !== 1) return false;
          let n = input[0] ?? 0;
          while (n > 0) {
            const digit = n % 10;
            if (digit >= threshold) expected += digit;
            n = Math.floor(n / 10);
          }
        }
      }
      return String(expected) === task.answer.value;
    },
  };
}

export const programAssign = program('program-assign');
export const programBranch = program('program-branch');
export const programFor = program('program-for');
export const programWhile = program('program-while');
