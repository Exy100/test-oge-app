import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind =
  | 'executor-fixed'
  | 'executor-shortest'
  | 'executor-missing'
  | 'executor-string';
const titles: Record<Kind, string> = {
  'executor-fixed': 'Составление программы заданной длины',
  'executor-shortest': 'Кратчайшая программа исполнителя',
  'executor-missing': 'Пропущенные команды программы',
  'executor-string': 'Перестановка символов командами',
};
interface Candidate {
  program: string;
  result: string;
  trace: string[];
}

function forward(
  start: string,
  command: (state: string, digit: string) => string,
  length: number,
): Candidate[] {
  let layer: Candidate[] = [{ program: '', result: start, trace: [start] }];
  for (let step = 0; step < length; step += 1)
    layer = layer.flatMap((candidate) =>
      ['1', '2'].map((digit) => {
        const result = command(candidate.result, digit);
        return {
          program: candidate.program + digit,
          result,
          trace: [...candidate.trace, result],
        };
      }),
    );
  return layer;
}

/** Independent reverse search. No execution of source strings. */
function reversePrograms(
  start: string,
  target: string,
  length: number,
  inverse: (state: string, digit: string) => string | null,
  pattern?: string,
): string[] {
  const results: string[] = [];
  function walk(state: string, remaining: number, suffix: string): void {
    if (remaining === 0) {
      if (state === start) results.push(suffix);
      return;
    }
    for (const digit of ['1', '2']) {
      const expected = pattern?.[remaining - 1];
      if (expected && expected !== '?' && expected !== digit) continue;
      const previous = inverse(state, digit);
      if (previous !== null) walk(previous, remaining - 1, digit + suffix);
    }
  }
  walk(target, length, '');
  return results;
}

function executor(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 5,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const strings = kind === 'executor-string';
      // start > add prevents both commands from coinciding at the initial state.
      const start = strings
        ? rng.shuffle(['А', 'Б', 'В', 'Г', 'Д', 'Е']).slice(0, 4).join('')
        : String(rng.int(5, 12));
      const add = rng.int(1, 4);
      const multiply = rng.int(2, 3);
      const length = rng.int(3, 5);
      const command = strings
        ? (state: string, digit: string) =>
            digit === '1'
              ? state.slice(1, 2) + state.slice(0, 1) + state.slice(2)
              : state.slice(1) + state.slice(0, 1)
        : (state: string, digit: string) =>
            String(
              digit === '1' ? Number(state) + add : Number(state) * multiply,
            );
      let candidates = forward(start, command, length);
      const holes = rng
        .shuffle(Array.from({ length }, (_, index) => index))
        .slice(0, 2)
        .sort((a, b) => a - b);
      const patternOf = (program: string) =>
        Array.from(program)
          .map((digit, index) => (holes.includes(index) ? '?' : digit))
          .join('');
      if (kind === 'executor-missing') {
        candidates = candidates.filter(
          (candidate, _, all) =>
            all.filter(
              (other) =>
                other.result === candidate.result &&
                patternOf(other.program) === patternOf(candidate.program),
            ).length === 1,
        );
      } else {
        candidates = candidates.filter(
          (candidate, _, all) =>
            all.filter((other) => other.result === candidate.result).length ===
            1,
        );
        if (kind === 'executor-shortest') {
          const earlier = new Set(
            Array.from({ length }, (_, size) => forward(start, command, size))
              .flat()
              .map((candidate) => candidate.result),
          );
          candidates = candidates.filter(
            (candidate) => !earlier.has(candidate.result),
          );
        }
      }
      candidates = candidates.filter(
        (candidate) =>
          candidate.program.includes('1') && candidate.program.includes('2'),
      );
      const chosen = rng.pick(candidates);
      const missing = kind === 'executor-missing';
      const answer = missing
        ? holes.map((index) => chosen.program[index]).join('')
        : chosen.program;
      const rules = strings
        ? `Начальная строка: ${start}. Команда 1 меняет местами первые два символа. Команда 2 переносит первый символ в конец строки. Цель: ${chosen.result}.`
        : `Начальное число: ${start}. Команда 1: прибавить ${String(add)}. Команда 2: умножить на ${String(multiply)}. Цель: ${chosen.result}.`;
      const question = missing
        ? `Программа: \`${patternOf(chosen.program)}\`. Восстанови две команды вместо ? и запиши только их номера слева направо.`
        : kind === 'executor-shortest'
          ? 'Найди кратчайшую программу длиной не более 5 команд. Запиши номера команд.'
          : `Составь программу ровно из ${String(length)} команд. Запиши номера команд.`;
      return taskFrom(kind, 5, seed, {
        statement: `${rules} ${question} Ответ — последовательность цифр 1 и 2 без пробелов. Команды выполняются слева направо.`,
        answer: {
          type: 'sequence',
          value: answer,
          alphabet: 'digits',
          caseSensitive: true,
        },
        solution: [
          {
            text: missing
              ? `Подставляй команды в позиции ${holes.map((index) => String(index + 1)).join(' и ')}, сохраняя известные команды.`
              : kind === 'executor-shortest'
                ? `Проверяй программы по возрастанию длины: от 0 до ${String(length)} команд.`
                : `Начальное состояние — ${start}. Число команд в программе должно быть равно ${String(length)}.`,
          },
          {
            text: `Программа ${chosen.program} даёт состояния: ${chosen.trace.join(' → ')}.`,
          },
          {
            text: missing
              ? `Только заполнение ${answer} даёт цель ${chosen.result}. Ответ: ${answer}.`
              : kind === 'executor-shortest'
                ? `Более короткие программы не дают ${chosen.result}; среди программ длины ${String(length)} подходит только ${chosen.program}. Ответ: ${answer}.`
                : `Перебор всех ${String(2 ** length)} программ этой длины оставляет единственный вариант: ${answer}.`,
          },
        ],
        hints: [
          'Применяй каждую команду к результату предыдущей.',
          missing
            ? 'Перебери четыре заполнения двух пропусков.'
            : kind === 'executor-shortest'
              ? 'Сначала проверь короткие программы; потом увеличивай длину.'
              : 'Сохраняй промежуточное состояние после каждого шага.',
          strings
            ? 'У переноса первого символа в конец и обмена первых двух символов разные результаты.'
            : 'Порядок сложения и умножения влияет на результат.',
        ],
        commonMistakes: [
          {
            answer: (answer[0] === '1' ? '2' : '1') + answer.slice(1),
            explanation:
              'Первая записанная команда подменена другой. Проверь соответствующее промежуточное состояние.',
          },
          {
            answer: answer.slice(0, -1),
            explanation:
              'Последняя команда пропущена. Проверь длину ответа и достижение цели.',
          },
        ],
      });
    },
    verify(task) {
      if (
        task.answer.type !== 'sequence' ||
        !/^[12]{1,5}$/u.test(task.answer.value)
      )
        return false;
      let start: string;
      let target: string;
      let inverse: (state: string, digit: string) => string | null;
      if (kind === 'executor-string') {
        const match =
          /^Начальная строка: ([А-ЯЁ]{4})\. Команда 1 меняет местами первые два символа\. Команда 2 переносит первый символ в конец строки\. Цель: ([А-ЯЁ]{4})\./u.exec(
            task.statement,
          );
        if (
          !match?.[1] ||
          !match[2] ||
          new Set(Array.from(match[1])).size !== 4
        )
          return false;
        start = match[1];
        target = match[2];
        inverse = (state, digit) =>
          digit === '1'
            ? state.slice(1, 2) + state.slice(0, 1) + state.slice(2)
            : state.slice(-1) + state.slice(0, -1);
      } else {
        const match =
          /^Начальное число: (\d+)\. Команда 1: прибавить (\d+)\. Команда 2: умножить на (\d+)\. Цель: (\d+)\./u.exec(
            task.statement,
          );
        if (!match?.[1] || !match[4]) return false;
        start = match[1];
        target = match[4];
        const add = Number(match[2]);
        const multiply = Number(match[3]);
        if (
          Number(start) < 1 ||
          Number(start) > 20 ||
          Number(target) > 10000 ||
          add < 1 ||
          add > 10 ||
          multiply < 2 ||
          multiply > 5
        )
          return false;
        inverse = (state, digit) => {
          const value =
            digit === '1' ? Number(state) - add : Number(state) / multiply;
          return Number.isInteger(value) && value >= Number(start)
            ? String(value)
            : null;
        };
      }
      if (kind === 'executor-shortest') {
        if (
          !task.statement.includes(
            'кратчайшую программу длиной не более 5 команд',
          )
        )
          return false;
        for (let length = 0; length <= 5; length += 1) {
          const results = reversePrograms(start, target, length, inverse);
          if (results.length)
            return results.length === 1 && results[0] === task.answer.value;
        }
        return false;
      }
      const pattern =
        kind === 'executor-missing'
          ? /Программа: `([12?]{3,5})`/u.exec(task.statement)?.[1]
          : undefined;
      const length =
        kind === 'executor-missing'
          ? pattern?.length
          : Number(/ровно из ([3-5]) команд/u.exec(task.statement)?.[1]);
      if (
        !length ||
        !Number.isInteger(length) ||
        (kind === 'executor-missing' && pattern?.split('?').length !== 3)
      )
        return false;
      const results = reversePrograms(start, target, length, inverse, pattern);
      const only = results[0];
      if (results.length !== 1 || only === undefined) return false;
      const expected = pattern
        ? Array.from(only)
            .filter((_, index) => pattern[index] === '?')
            .join('')
        : only;
      return expected === task.answer.value;
    },
  };
}

export const executorFixed = executor('executor-fixed');
export const executorShortest = executor('executor-shortest');
export const executorMissing = executor('executor-missing');
export const executorString = executor('executor-string');
