import type { Generator, TaskInstance } from '../../types.ts';
import { taskFrom } from '../task.ts';
import { programGuidance } from './guidance.ts';
import {
  programCases,
  programKinds,
  programParameters,
  isExamProgramKind,
  validateProgramParameters,
  type ProgramKind,
  type ProgramParameters,
} from './problems.ts';

export const programDatasetId = (kind: ProgramKind, seed: string): string =>
  `${kind}-v1:files:${seed}`;
export function referencePython(p: ProgramParameters): string {
  validateProgramParameters(p);
  if (p.kind === 'python-positive-mean')
    return 'n = int(input())\ncount = 0\ntotal = 0\nfor i in range(n):\n    x = int(input())\n    if x > 0:\n        count += 1\n        total += x\nprint(total / count, count)\n';
  if (p.kind === 'python-base7-sum')
    return 'n = int(input())\ntotal = 0\nfor i in range(n):\n    x = int(input())\n    if x % 7 == 1:\n        total += x\nprint(total)\n';
  if (p.kind === 'python-octal-sentinel')
    return 'count = 0\nx = int(input())\nwhile x != 0:\n    if 512 <= x < 4096 and x % 8 == 5:\n        count += 1\n    x = int(input())\nprint(count)\n';
  if (p.kind === 'python-filter')
    return `n = int(input())\ncount = 0\ntotal = 0\nfor i in range(n):\n    x = int(input())\n    if x % ${String(p.divisor)} == 0 and x >= ${String(p.threshold)}:\n        count += 1\n        total += x\nprint(count, total)\n`;
  if (p.kind === 'python-digits')
    return `n = int(input())\ncount = 0\ntotal = 0\nif n == 0:\n    count = 1\nwhile n > 0:\n    digit = n % 10\n    if digit % ${String(p.divisor)} == 0:\n        count += 1\n        total += digit\n    n //= 10\nprint(count, total)\n`;
  if (p.kind === 'python-pairs')
    return `n = int(input())\nprevious = int(input())\ncount = 0\nbest = 0\nfor i in range(n - 1):\n    current = int(input())\n    pair_sum = previous + current\n    if pair_sum % ${String(p.divisor)} == 0:\n        if count == 0 or pair_sum > best:\n            best = pair_sum\n        count += 1\n    previous = current\nprint(count, best)\n`;
  return `n = int(input())\ncurrent = 0\nbest = 0\nfor i in range(n):\n    x = int(input())\n    if x >= ${String(p.threshold)}:\n        current += 1\n        if current > best:\n            best = current\n    else:\n        current = 0\nprint(best)\n`;
}
const titles: Record<ProgramKind, string> = {
  'python-filter': 'Отбор и сумма чисел',
  'python-digits': 'Обработка цифр числа',
  'python-pairs': 'Соседние пары',
  'python-run': 'Самая длинная цепочка',
  'python-positive-mean': 'Среднее положительных чисел',
  'python-base7-sum': 'Сумма по семеричной записи',
  'python-octal-sentinel': 'Восьмеричная запись и ввод до нуля',
};
function rules(p: ProgramParameters): string {
  if (p.kind === 'python-positive-mean')
    return 'Среди N целых чисел найди среднее арифметическое положительных чисел и их количество. Хотя бы одно положительное число есть. Выведи сначала среднее, затем количество. Среднее не округляй до целого: используй обычное деление. Дробную часть записывай через точку; допустима экспоненциальная запись. Проверка принимает абсолютную погрешность среднего не более 0.000001; количество должно быть целым и точным.';
  if (p.kind === 'python-base7-sum')
    return 'Среди N натуральных чисел найди сумму тех, последняя цифра семеричной записи которых равна 1. Выведи сумму в десятичной системе. Если подходящих чисел нет, выведи 0.';
  if (p.kind === 'python-octal-sentinel')
    return 'Вводится последовательность натуральных чисел, за которой следует 0 — признак конца ввода. Найди количество чисел, восьмеричная запись которых состоит ровно из четырёх цифр и заканчивается цифрой 5. Выведи количество в десятичной системе; если подходящих чисел нет, выведи 0. Завершающий ноль в последовательность не входит.';
  if (p.kind === 'python-filter')
    return `Среди N целых чисел найди количество и сумму тех, которые делятся на ${String(p.divisor)} без остатка и не меньше ${String(p.threshold)}. Выведи два целых числа: сначала количество, затем сумму. Если подходящих чисел нет, выведи 0 0.`;
  if (p.kind === 'python-digits')
    return `Для неотрицательного целого числа найди количество и сумму цифр его обычной десятичной записи, которые делятся на ${String(p.divisor)} без остатка. Запись не содержит ведущих нулей; число 0 записывается одной цифрой 0, которая делится на любое положительное целое. Выведи количество и сумму через пробел; если подходящих цифр нет, выведи 0 0.`;
  if (p.kind === 'python-pairs')
    return `Рассмотри соседние пары N целых чисел: первое и второе, второе и третье и далее. Пары могут перекрываться. Найди количество пар, сумма которых делится на ${String(p.divisor)} без остатка, и наибольшую из этих сумм. Сначала выведи количество, затем максимум. Суммы могут быть отрицательными. При отсутствии подходящих пар, в том числе при N = 1, выведи 0 0.`;
  return `Найди длину самой длинной непрерывной цепочки чисел, каждое из которых не меньше ${String(p.threshold)}. Меньшее число разрывает цепочку. Выведи одно целое число — длину; если ни одно число не подходит, выведи 0.`;
}
function generator(kind: ProgramKind): Generator {
  const build = (seed: string) => {
    const p = programParameters(kind, seed),
      example = programCases(p, seed)[0];
    if (!example) throw new Error('Нет примера ввода.');
    const guidance = programGuidance(p, example);
    const input =
      kind === 'python-digits'
        ? 'Ввод: одна строка, целое число от 0 до 999999999999 включительно.'
        : kind === 'python-octal-sentinel'
          ? 'Ввод: по одному числу на строке, от 1 до 10000 включительно; не более 1000 чисел. Последняя строка — 0. Первое число тоже может быть нулём. Количество чисел заранее не задано.'
          : kind === 'python-base7-sum'
            ? 'Ввод: первая строка — N, целое от 1 до 1000 включительно. Затем N строк, по одному натуральному числу от 1 до 10000 включительно.'
            : 'Ввод: первая строка — N, целое от 1 до 1000 включительно. Затем ровно N строк, по одному целому числу от −10000 до 10000 включительно. Порядок чисел сохраняется.';
    const output =
      kind === 'python-positive-mean'
        ? 'Выводи только среднее и целое количество, без приглашений и пояснений. Разделяй числа пробелами или переводами строк.'
        : 'Выводи только указанные целые числа, без приглашений и пояснений. Числа результата разделяй пробелом.';
    return {
      ...taskFrom(kind, 16, seed, {
        statement: `Напиши программу на Python 3. ${rules(p)}\n\n${input}\n${output}\n\nПример ввода:\n\`\`\`\n${example.input.trimEnd()}\n\`\`\`\nПример вывода:\n\`\`\`\n${example.output.trimEnd()}\n\`\`\`\n\nСохрани код в answer.py, UTF-8. В архиве находятся десять тестов, эталон и инструкция локального запуска. Проверка использует лимит 2 секунды на тест; это учебное ограничение, а не норма экзамена. Учебные критерии 0/1/2 относятся к результатам запусков и не заменяют официальную экспертную оценку.`,
        answer: {
          type: 'artifact',
          kind: 'program',
          referenceId: `${kind}-v1:${seed}:reference`,
        },
        solution: guidance.steps.map((text, index) => ({
          text,
          ...(index === 2 ? { code: referencePython(p) } : {}),
        })),
        hints: [...guidance.hints],
        commonMistakes: [
          {
            answer: 'example-only',
            explanation:
              'Вывод готового ответа из примера не решает задачу для других входных данных.',
          },
          {
            answer: 'boundary',
            explanation: guidance.steps[0],
          },
        ],
      }),
      datasetId: programDatasetId(kind, seed),
      ...(isExamProgramKind(kind)
        ? {
            difficulty:
              kind === 'python-base7-sum' ? (2 as const) : (3 as const),
          }
        : {}),
      criteria: {
        max: 2 as const,
        levels: [
          {
            score: 0 as const,
            description:
              'Ни один тест не пройден: нет запуска, ошибка исполнения или неверный вывод. Само наличие файла не даёт балла.',
          },
          {
            score: 1 as const,
            description:
              'Программа нормально завершилась и дала верный вывод на части из десяти тестов, но не на всех.',
          },
          {
            score: 2 as const,
            description:
              'Программа нормально завершилась и дала верный вывод на всех десяти тестах, включая граничные случаи.',
          },
        ],
      },
    };
  };
  return {
    id: `${kind}-v1`,
    taskNumber: 16,
    subtype: kind,
    title: titles[kind],
    generate: build,
    verify(task) {
      const expected = build(task.seed);
      return (
        Object.keys(task).length === Object.keys(expected).length &&
        Object.entries(expected).every(
          ([key, value]) =>
            JSON.stringify(task[key as keyof TaskInstance]) ===
            JSON.stringify(value),
        )
      );
    },
  };
}
export const pythonGenerators = programKinds.map(generator);
export const examPythonGenerators = pythonGenerators.filter((item) =>
  isExamProgramKind(item.subtype),
);
export const learningPythonGenerators = pythonGenerators.filter(
  (item) => !isExamProgramKind(item.subtype),
);
