import type {
  CorrectAnswer,
  FigureSpec,
  Generator,
  TaskInstance,
} from '../../types.ts';
import { taskFrom, quantity, bytes } from '../task.ts';
import { decodeGuidance } from './decode-guidance.ts';
import {
  decodeSolutions,
  executeCommands,
  executorSolutions,
  parameterInterval,
  pathCount,
  pathTotals,
  queryAnswer,
  numeralSum,
  urlOrders,
  deletedWords,
  logicAnswer,
  logicHolds,
  roadDistances,
  type LogicPredicate,
  type ExamShortProblem,
} from './short-problems.ts';

export type ShortAnswer = Exclude<CorrectAnswer, { type: 'artifact' }>;
export interface ExamConstruction {
  problem: ExamShortProblem;
  answer: ShortAnswer;
  message?: string;
}
export function sequenceAnswer(
  values: readonly string[],
  alphabet: 'digits' | 'cyrillic',
): ShortAnswer {
  const choices = [...new Set(values)].sort(
    (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const value = choices[0];
  if (!value || choices.length > 64)
    throw new RangeError('Некорректное число допустимых ответов.');
  return {
    type: 'sequence',
    value,
    alphabet,
    caseSensitive: alphabet === 'digits',
    ...(choices.length > 1 ? { alternatives: choices.slice(1) } : {}),
  };
}
export function permutations(value: string): string[] {
  if (value.length > 4)
    throw new RangeError('Слишком много повторяющихся букв.');
  if (value.length <= 1) return [value];
  return Array.from(value).flatMap((letter, index) =>
    permutations(value.slice(0, index) + value.slice(index + 1)).map(
      (suffix) => letter + suffix,
    ),
  );
}
export function problemSubtype(p: ExamShortProblem): string {
  switch (p.kind) {
    case 'deleted-word':
      return 'removed-word';
    case 'logic':
      return `logic-${p.mode}`;
    case 'roads':
      return 'shortest-road';
    case 'decode':
      return p.repeatedOnly
        ? 'decode-repeated'
        : Object.values(p.codes).some((a, i, codes) =>
              codes.some((b, j) => i !== j && b.startsWith(a)),
            )
          ? 'decode-nonprefix'
          : 'decode-prefix';
    case 'executor':
      return p.square ? 'executor-square' : 'executor-multiply';
    case 'program-parameter':
      return `parameter-${p.mode}`;
    case 'url':
      return 'url-fragments';
    case 'search':
      return p.right === undefined
        ? 'search-conditional-pair'
        : 'search-conditional-triple';
    case 'paths':
      return 'paths-diagram';
    case 'numerals':
      return 'numeral-sum';
  }
}
export function solveProblem(p: ExamShortProblem): ShortAnswer {
  switch (p.kind) {
    case 'deleted-word': {
      const words = deletedWords(p);
      if (words.length !== 1 || !words[0])
        throw new RangeError('Удалённое слово определяется неоднозначно.');
      return { type: 'word', value: words[0], caseSensitive: false };
    }
    case 'logic':
      return integerAnswer(logicAnswer(p));
    case 'roads':
      return integerAnswer(roadDistances(p).get(p.end) ?? 0);
    case 'decode': {
      const values = decodeSolutions(p);
      if (values.length !== 1)
        throw new RangeError('У сигнала нет единственной расшифровки.');
      return sequenceAnswer(
        p.repeatedOnly ? permutations(values[0] ?? '') : values,
        'cyrillic',
      );
    }
    case 'executor':
      return sequenceAnswer(executorSolutions(p), 'digits');
    case 'program-parameter': {
      const interval = parameterInterval(p);
      const value =
        p.mode === 'max' ? interval.max : (interval.min ?? interval.max);
      if (value === undefined) throw new RangeError('Не найден допустимый A.');
      return {
        type: 'integer',
        value: String(value),
        ...(p.mode === 'any'
          ? {
              acceptedRange: {
                ...(interval.min !== undefined
                  ? { min: String(interval.min) }
                  : {}),
                ...(interval.max !== undefined
                  ? { max: String(interval.max) }
                  : {}),
              },
            }
          : {}),
      };
    }
    case 'url':
      return sequenceAnswer(urlOrders(p), 'digits');
    case 'search':
      return { type: 'integer', value: String(queryAnswer(p)) };
    case 'paths':
      return { type: 'integer', value: String(pathCount(p)) };
    case 'numerals':
      return { type: 'integer', value: String(numeralSum(p)) };
  }
}
export function examDifficulty(
  p: ExamShortProblem,
  answer: ShortAnswer,
): 1 | 2 | 3 {
  switch (p.kind) {
    case 'deleted-word':
      return p.words.length >= 9 && p.bits === 16
        ? 3
        : p.bits === 16 || p.words.length >= 8
          ? 2
          : 1;
    case 'logic': {
      const count = (expression: LogicPredicate): number =>
        expression[0] === 'not'
          ? 1 + count(expression[1])
          : expression[0] === 'and' || expression[0] === 'or'
            ? 1 + count(expression[1]) + count(expression[2])
            : 1;
      const size = count(p.predicate);
      return size >= 7 ? 3 : size >= 4 ? 2 : 1;
    }
    case 'roads':
      return p.edges.length >= 11 ? 3 : p.edges.length >= 8 ? 2 : 1;
    case 'decode':
      return p.repeatedOnly
        ? answer.value.length > 2
          ? 3
          : 2
        : problemSubtype(p) === 'decode-prefix'
          ? p.encoded.length < 20
            ? 1
            : 2
          : p.encoded.length < 20
            ? 2
            : 3;
    case 'executor':
      return answer.value.length <= 3
        ? 1
        : p.square || answer.value.length === 5
          ? 3
          : 2;
    case 'program-parameter': {
      const relevant = p.pairs.filter(([s, t]) =>
        p.variable === 's' ? t <= p.fixed : s <= p.fixed,
      );
      const distinct = new Set(
        relevant.map(([s, t]) => (p.variable === 's' ? s : t)),
      ).size;
      return distinct <= 3
        ? 1
        : distinct >= 7 && p.pairs.some(([s, t]) => s < 0 || t < 0)
          ? 3
          : 2;
    }
    case 'url': {
      const ambiguousPieces = p.fragments.filter(
        (a, i) =>
          a.length > 1 && p.fragments.some((b, j) => i !== j && b.includes(a)),
      ).length;
      return ambiguousPieces >= 2 ? 3 : ambiguousPieces ? 2 : 1;
    }
    case 'search':
      return p.right === undefined
        ? Math.max(p.union, p.left, p.both ?? 0) >= 1000
          ? 3
          : 2
        : Math.max(p.union, p.left, p.right) >= 1000
          ? 2
          : 1;
    case 'paths':
      return p.edges.length >= 15 ? 3 : p.edges.length <= 10 ? 1 : 2;
    case 'numerals': {
      const binary = p.terms.find(([, base]) => base === 2)?.[0].length ?? 0;
      return binary >= 10
        ? 3
        : binary <= 6 && !p.terms.some(([digits]) => /[A-F]/u.test(digits))
          ? 1
          : 2;
    }
  }
}
const numbers: Record<
  ExamShortProblem['kind'],
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
> = {
  'deleted-word': 1,
  logic: 3,
  roads: 4,
  decode: 2,
  executor: 5,
  'program-parameter': 6,
  url: 7,
  search: 8,
  paths: 9,
  numerals: 10,
};
const integerAnswer = (value: number): ShortAnswer => ({
  type: 'integer',
  value: String(value),
});
export function logicText(p: LogicPredicate): string {
  switch (p[0]) {
    case 'odd':
      return '(X нечётное)';
    case 'not':
      return `(НЕ ${logicText(p[1])})`;
    case 'and':
      return `(${logicText(p[1])} И ${logicText(p[2])})`;
    case 'or':
      return `(${logicText(p[1])} ИЛИ ${logicText(p[2])})`;
    default:
      return `(X ${{ gt: '>', ge: '>=', le: '<=', eq: '=' }[p[0]]} ${String(p[1])})`;
  }
}
function table(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const row = (items: readonly (string | number)[]) =>
    `| ${items.map((item) => String(item).replaceAll('|', '\\|')).join(' | ')} |`;
  return [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join(
    '\n',
  );
}

function logicConditions(p: LogicPredicate, negate = false): string {
  if (p[0] === 'not') return logicConditions(p[1], !negate);
  if (p[0] === 'and' || p[0] === 'or') {
    const both = (p[0] === 'and') !== negate;
    return `(${logicConditions(p[1], negate)} ${both ? 'И' : 'ИЛИ'} ${logicConditions(p[2], negate)})`;
  }
  if (p[0] === 'odd') return negate ? 'X чётное' : 'X нечётное';
  const sign = negate
    ? { gt: '≤', ge: '<', le: '>', eq: '≠' }[p[0]]
    : { gt: '>', ge: '≥', le: '≤', eq: '=' }[p[0]];
  return `X ${sign} ${String(p[1])}`;
}

function logicBoundaries(p: LogicPredicate): number[] {
  if (p[0] === 'not') return logicBoundaries(p[1]);
  if (p[0] === 'and' || p[0] === 'or')
    return [
      ...new Set([...logicBoundaries(p[1]), ...logicBoundaries(p[2])]),
    ].sort((a, b) => a - b);
  return typeof p[1] === 'number' ? [p[1]] : [];
}
function pathFigure(
  p: Extract<ExamShortProblem, { kind: 'paths' }>,
): FigureSpec {
  return {
    kind: 'directed-graph',
    description: `Схема дорог: движение только по стрелкам, начальный город A, конечный ${p.end}.`,
    nodes: [...new Set(['A', p.end, ...p.edges.flatMap(([a, b]) => [a, b])])]
      .sort()
      .map((id) => ({ id, label: id })),
    edges: p.edges.map(([from, to]) => ({ from, to })),
  };
}
/** Presentation is built from constructive data; verify uses separate subject solvers. */
export function buildExamShortTask(
  construction: ExamConstruction,
  seed: string,
): TaskInstance {
  const p = construction.problem,
    answer = construction.answer,
    subtype = problemSubtype(p),
    number = numbers[p.kind];
  let statement: string,
    steps: [string, string, string],
    hints: [string, string, string],
    mistakes: [string, string];
  if (p.kind === 'deleted-word') {
    statement = `В кодировке каждый символ занимает ${String(p.bits)} бит. Записан список слов: «${p.words.join(', ')}». Одно слово удалили вместе с лишними запятой и пробелом; двойных пробелов не осталось. Размер текста уменьшился на ${bytes(p.bytes)}. Какое слово удалили?`;
    const letters = (p.bytes * 8) / p.bits - 2;
    steps = [
      `Один символ занимает ${String(p.bits)} ÷ 8 = ${bytes(p.bits / 8)}. Всего удалили ${String(p.bytes)} ÷ ${String(p.bits / 8)} = ${quantity((p.bytes * 8) / p.bits, ['символ', 'символа', 'символов'])}.`,
      `Вместе со словом удалили запятую и пробел — два символа. На само слово приходится ${String((p.bytes * 8) / p.bits)} − 2 = ${quantity(letters, ['символ', 'символа', 'символов'])}. Дефис тоже считается символом.`,
      `В списке такую длину имеет слово «${answer.value}». Проверка: (${String(answer.value.length)} + 2) · ${String(p.bits / 8)} = ${bytes(p.bytes)}.`,
    ];
    hints = [
      `В этой кодировке один символ занимает ${String(p.bits)} бит. В одном байте 8 бит. Раздели ${String(p.bits)} на 8, чтобы узнать размер символа в байтах.`,
      `Объём текста уменьшился на ${bytes(p.bytes)}. Раздели ${String(p.bytes)} на размер одного символа в байтах: получится число всех удалённых символов.`,
      'Вместе со словом удалили ещё два символа: запятую и пробел. Вычти 2 из найденного числа символов и найди в списке слово с такой длиной.',
    ];
    const others = p.words
      .filter((word) => word !== answer.value)
      .sort(
        (a, b) => Math.abs(a.length - letters) - Math.abs(b.length - letters),
      );
    mistakes = [others[0] ?? '', others[1] ?? ''];
  } else if (p.kind === 'logic') {
    statement = `${p.mode === 'count-true' ? 'Сколько натуральных чисел X делают выражение истинным?' : 'Найди наименьшее натуральное число X, при котором выражение ложно.'}\n\nВыражение: \`${logicText(p.predicate)}\`.\n\nНатуральные числа начинаются с 1.`;
    const value = Number(answer.value);
    const bounds = logicBoundaries(p.predicate);
    const target = logicConditions(p.predicate, p.mode === 'min-false');
    const boundaryChecks = bounds
      .map(
        (x) =>
          `при X = ${String(x)} выражение ${logicHolds(p.predicate, x) ? 'истинно' : 'ложно'}`,
      )
      .join('; ');
    steps =
      p.mode === 'count-true'
        ? [
            `После раскрытия НЕ условие истинности: ${target}. Для И выполняются обе части, для ИЛИ достаточно одной.`,
            `Подходящие натуральные X: ${
              Array.from({ length: 1001 }, (_, i) => i + 1)
                .filter((x) => logicHolds(p.predicate, x))
                .join(', ') || 'нет'
            }.`,
            `Количество подходящих значений: ${answer.value}. Проверка границ: ${boundaryChecks}. Ноль в натуральные числа не включён.`,
          ]
        : [
            `Нужно ложное значение всего выражения, поэтому условие поиска после раскрытия отрицания: ${target}.`,
            `При X = ${answer.value} выражение ${logicHolds(p.predicate, value) ? 'истинно' : 'ложно'}. При меньших натуральных X оно истинно.`,
            `Проверка соседнего числа: при X = ${String(value - 1)} выражение ${logicHolds(p.predicate, value - 1) ? 'истинно' : 'ложно'}. Первое ложное значение достигается при X = ${answer.value}.`,
          ];
    hints = [
      `В выражении ${logicText(p.predicate)} сначала выполни сравнения, затем НЕ, И и ИЛИ с учётом скобок.`,
      `Отметь на числовой прямой границы ${bounds.join(', ')}. Проверь сами граничные числа: строгий знак > или < их не включает.`,
      p.mode === 'count-true'
        ? `Выпиши натуральные X, для которых выполняется ${target}, и посчитай их. Начинай с 1, а не с 0.`
        : `Найди первое натуральное X, для которого выполняется ${target}; проверь его и ближайшее меньшее число.`,
    ];
    mistakes = [String(value - 1), String(value + 1)];
  } else if (p.kind === 'roads') {
    const names = [
      ...new Set(['A', p.end, ...p.edges.flatMap(([a, b]) => [a, b])]),
    ].sort();
    statement = `В таблице указаны длины дорог между пунктами в километрах. Знак — означает, что прямой дороги нет. По каждой дороге можно двигаться в обе стороны.\n\n${table(
      ['Пункт', ...names],
      names.map((from) => [
        from,
        ...names.map((to) =>
          from === to
            ? '—'
            : (p.edges.find(
                ([a, b]) =>
                  (a === from && b === to) || (b === from && a === to),
              )?.[2] ?? '—'),
        ),
      ]),
    )}\n\nКакова длина кратчайшего пути из A в ${p.end}? В ответе запиши число километров.`;
    const distances = roadDistances(p);
    const route = [p.end];
    const lengths: number[] = [];
    while (route[0] !== 'A') {
      const at = route[0];
      const edge = p.edges.find(([from, to, length]) => {
        const previous = from === at ? to : to === at ? from : undefined;
        return (
          previous !== undefined &&
          (distances.get(previous) ?? Infinity) + length ===
            distances.get(at ?? '')
        );
      });
      if (!edge) throw new Error('Не удалось восстановить кратчайший маршрут.');
      route.unshift(edge[0] === at ? edge[1] : edge[0]);
      lengths.unshift(edge[2]);
    }
    const firstRoads = p.edges
      .filter(([a, b]) => a === 'A' || b === 'A')
      .map(([a, b, length]) => `${a === 'A' ? b : a}: ${String(length)} км`)
      .join('; ');
    const finalRoads = p.edges
      .filter(([a, b]) => a === p.end || b === p.end)
      .map(
        ([a, b, length]) =>
          `${a === p.end ? b : a}–${p.end}: ${String(length)} км`,
      )
      .join('; ');
    steps = [
      `До A расстояние 0. Прямые дороги из A: ${firstRoads}. При переходе к соседу прибавляй длину дороги; сохраняй меньшую из найденных сумм.`,
      `Минимальные расстояния от A: ${names.map((name) => `${name} — ${String(distances.get(name))}`).join('; ')} км.`,
      `Кратчайший маршрут: ${route.join(' → ')}. Проверка по таблице: ${lengths.join(' + ')} = ${answer.value} км. Число дорог само по себе длину пути не определяет.`,
    ];
    hints = [
      `В строке A найди прямые дороги: ${firstRoads}. Перепиши их длины; прочерк не разрешает переход.`,
      `Для пути из A в ${p.end} складывай километры из таблицы, а не число дорог. Для каждого промежуточного пункта оставляй наименьшую найденную сумму.`,
      `Последняя дорога к ${p.end} выбирается из ${finalRoads}. К каждой длине прибавь найденное расстояние от A до её начала и сравни суммы.`,
    ];
    mistakes = [
      String(Number(answer.value) + 1),
      String(Number(answer.value) * 2),
    ];
  } else if (p.kind === 'decode') {
    const message = construction.message;
    if (
      !message ||
      Array.from(message, (letter) => p.codes[letter]).join('') !== p.encoded
    )
      throw new Error('Конструктивная расшифровка не соответствует сигналу.');
    statement = `Сообщение закодировано с помощью таблицы. Между кодами букв нет дополнительных разделителей.\n\n${table(
      ['Буква', 'Код'],
      Object.entries(p.codes).map(([letter, code]) => [letter, `\`${code}\``]),
    )}\n\nСигнал: \`${p.encoded}\`. ${p.repeatedOnly ? 'Какие буквы встречаются в сообщении более одного раза? Запиши каждую такую букву один раз, в любом порядке.' : 'Расшифруй сообщение и запиши последовательность букв.'}`;
    ({ steps, hints } = decodeGuidance(p, message, answer.value));
    mistakes = [
      answer.value + (answer.value[0] ?? ''),
      answer.value.slice(0, -1) || 'Я',
    ];
  } else if (p.kind === 'executor') {
    statement = `У исполнителя две команды:\n1. ${p.square ? 'Возведи число в квадрат' : `Умножь на ${String(p.multiplier)}`}.\n2. Прибавь ${String(p.add)}.\n\nСоставь программу, которая переводит число ${String(p.start)} в число ${String(p.end)} и содержит не более ${String(p.limit)} команд. В ответе запиши только номера команд. Если подходящих программ несколько, запиши любую.`;
    let value = BigInt(p.start);
    const trace = [String(value)];
    for (const digit of answer.value) {
      value =
        digit === '1'
          ? p.square
            ? value * value
            : value * BigInt(p.multiplier ?? 1)
          : value + BigInt(p.add);
      trace.push(String(value));
    }
    steps = [
      `От ${String(p.end)} можно идти назад: обратная команда 2 вычитает ${String(p.add)}, а обратная команда 1 ${p.square ? 'извлекает целый квадратный корень' : `делит на ${String(p.multiplier)}`}. Нужен возврат к ${String(p.start)} не более чем за ${String(p.limit)} команд.`,
      `Один подходящий вариант — ${answer.value}: ${trace.join(' → ')}.`,
      `Последнее значение равно ${String(p.end)}, длина программы ${String(answer.value.length)} не превышает ${String(p.limit)}. Другие подходящие программы также принимаются.`,
    ];
    hints = [
      `Начни с ${String(p.end)}: перед командой 2 стояло бы ${String(p.end - p.add)}. Проверь и возможность обратной команды 1.`,
      p.square
        ? `Для обратной команды 1 у числа ${String(p.end)} нужен целый квадратный корень. Нецелый корень не подходит.`
        : `Для обратной команды 1 проверь делимость ${String(p.end)} на ${String(p.multiplier)}. Нецелое частное не подходит.`,
      `Исполни найденные команды от ${String(p.start)}: последним должно стать ${String(p.end)}, а команд должно быть не больше ${String(p.limit)}.`,
    ];
    const bad = ['1', '2', '11', '22', '12', '21', '111', '222'].filter(
      (code) =>
        code.length <= p.limit && executeCommands(p, code) !== BigInt(p.end),
    );
    mistakes = [bad[0] ?? '11111', bad[1] ?? '22222'];
  } else if (p.kind === 'program-parameter') {
    const predicate =
      p.variable === 's'
        ? `s > A or t > ${String(p.fixed)}`
        : `s > ${String(p.fixed)} or t > A`;
    const code = `s = int(input())\nt = int(input())\nA = int(input())\nif ${predicate}:\n    print("YES")\nelse:\n    print("NO")`;
    statement = `Программа запускалась девять раз; в каждом запуске вводилась одна из пар (s, t) из таблицы и одно и то же целое число A.\n\n\`\`\`python\n${code}\n\`\`\`\n\n${table(['s', 't'], p.pairs)}\n\n${p.mode === 'min' ? 'Укажи наименьшее' : p.mode === 'max' ? 'Укажи наибольшее' : 'Укажи любое'} целое значение A, при котором программа напечатала YES ровно ${quantity(p.yes, ['раз', 'раза', 'раз'])}.`;
    const a = Number(answer.value);
    const interval = parameterInterval(p);
    const independent = p.pairs.filter(
      ([s, t]) => (p.variable === 's' ? t : s) > p.fixed,
    );
    const relevant = p.pairs
      .filter(([s, t]) => (p.variable === 's' ? t : s) <= p.fixed)
      .map(([s, t]) => (p.variable === 's' ? s : t))
      .sort((x, y) => x - y);
    const needed = p.yes - independent.length;
    const rangeText = [
      interval.min !== undefined ? `A ≥ ${String(interval.min)}` : null,
      interval.max !== undefined ? `A ≤ ${String(interval.max)}` : null,
    ]
      .filter((part) => part !== null)
      .join(' и ');
    steps = [
      `От A не зависят запуски, где ${p.variable === 's' ? 't' : 's'} > ${String(p.fixed)}: ${independent.map(([s, t]) => `(${String(s)}, ${String(t)})`).join(', ') || 'таких пар нет'}. Число этих YES: ${String(independent.length)}. Остальные значения ${p.variable}: ${relevant.join(', ')}. Требуемое число значений больше A: ${String(needed)}.`,
      `При A = ${answer.value} результаты девяти запусков: ${p.pairs.map(([s, t]) => ((p.variable === 's' ? s > a || t > p.fixed : s > p.fixed || t > a) ? 'YES' : 'NO')).join(', ')}. Получено ${String(p.yes)} YES.`,
      p.mode === 'any'
        ? `Подходит каждое целое ${rangeText}. Например, ${answer.value}.`
        : `Допустимые целые значения: ${rangeText}. Сравнение строгое; ${p.mode === 'min' ? 'первое' : 'последнее'} подходящее A равно ${answer.value}. Проверь соседнее целое за указанной границей: нужное число YES уже не получается.`,
    ];
    hints = [
      `Найди пары, где ${p.variable === 's' ? 't' : 's'} > ${String(p.fixed)}. Эти запуски уже дают YES независимо от A.`,
      `Остальные значения ${p.variable} по возрастанию: ${relevant.join(', ')}. Нужно ${String(p.yes)} YES всего; вычти уже найденные ${String(independent.length)}.`,
      `Сравнение ${p.variable} > A строгое. Подбери границу среди ${relevant.join(', ')} и проверь все девять пар, чтобы получить ровно ${String(p.yes)} YES.`,
    ];
    const candidates = [
      a - 1,
      a + 1,
      ...p.pairs.flatMap(([s, t]) => [s - 1, t + 1]),
      -1001,
      1001,
    ];
    const good = (n: number) =>
      answer.type === 'integer' && answer.acceptedRange
        ? (answer.acceptedRange.min === undefined ||
            n >= Number(answer.acceptedRange.min)) &&
          (answer.acceptedRange.max === undefined ||
            n <= Number(answer.acceptedRange.max))
        : n === a;
    const wrong = [...new Set(candidates.filter((n) => !good(n)))];
    mistakes = [String(wrong[0]), String(wrong[1])];
  } else if (p.kind === 'url') {
    const parsed = new URL(p.target);
    const filename = parsed.pathname.slice(1);
    statement = `Доступ к файлу ${filename} на сервере ${parsed.hostname} осуществляется по протоколу ${parsed.protocol.slice(0, -1).toUpperCase()}. Фрагменты адреса закодированы цифрами от 1 до 7. Запиши последовательность цифр, кодирующую адрес файла.\n\n${table(
      ['Цифра', 'Фрагмент'],
      p.fragments.map((fragment, i) => [i + 1, `\`${fragment}\``]),
    )}`;
    steps = [
      `Для протокола ${parsed.protocol.slice(0, -1).toUpperCase()} запиши начало ${parsed.protocol}//. Затем идут сервер ${parsed.hostname}, знак / и файл ${filename}.`,
      `Полный адрес: ${p.target}.`,
      `Замени его части цифрами из таблицы: ${answer.value}. Проверь, что использованы все семь фрагментов.`,
    ];
    hints = [
      `Начни с ${parsed.protocol.slice(0, -1).toUpperCase()} и знаков ://. Найди соответствующие фрагменты в таблице с цифрами 1–7.`,
      `Сервер здесь ${parsed.hostname}, а файл — ${filename}. Точка в расширении файла относится к имени после /, а не к домену сервера.`,
      `Собери ${p.target}, затем замени его фрагменты цифрами. Все семь фрагментов таблицы должны войти в адрес.`,
    ];
    mistakes = [
      Array.from(answer.value).reverse().join(''),
      answer.value.slice(0, -1),
    ];
  } else if (p.kind === 'search') {
    const rows: [string, number][] = [
      ['Лира & (Вега | Альтаир)', p.union],
      ['Лира & Вега', p.left],
      p.right !== undefined
        ? ['Лира & Альтаир', p.right]
        : ['Лира & Вега & Альтаир', p.both ?? 0],
    ];
    const target =
      p.right === undefined ? 'Лира & Альтаир' : 'Лира & Вега & Альтаир';
    statement = `В языке поисковых запросов | означает «ИЛИ», & — «И». Все запросы выполнены по одной неизменной базе страниц. Количества указаны в тысячах.\n\n${table(
      ['Запрос', 'Найдено страниц (тыс.)'],
      rows.map(([query, count]) => [`\`${query}\``, count]),
    )}\n\nСколько тысяч страниц найдёт запрос \`${target}\`? Запиши целое число.`;
    steps = [
      `Запрос «Лира & (Вега | Альтаир)» объединяет страницы двух запросов: «Лира & Вега» и «Лира & Альтаир». В объединении ${String(p.union)} тыс. страниц.`,
      `В запросе «Лира & Вега» ${String(p.left)} тыс. страниц. ${p.right !== undefined ? `В запросе «Лира & Альтаир» ${String(p.right)} тыс.; при сложении пересечение учитывается дважды.` : `В общем пересечении ${String(p.both)} тыс.; вычитая первое множество, нужно вернуть эту общую часть.`}`,
      p.right !== undefined
        ? `Пересечение: ${String(p.left)} + ${String(p.right)} − ${String(p.union)} = ${answer.value} тыс. Проверка объединения: ${String(p.left)} + ${String(p.right)} − ${answer.value} = ${String(p.union)}.`
        : `Искомое множество: ${String(p.union)} − ${String(p.left)} + ${String(p.both)} = ${answer.value} тыс. Проверка объединения: ${String(p.left)} + ${answer.value} − ${String(p.both)} = ${String(p.union)}.`,
    ];
    hints = [
      `Рассмотри «Лира & Вега» и «Лира & Альтаир»: запрос со скобками объединяет их и даёт ${String(p.union)} тыс. страниц.`,
      `При сложении результатов двух запросов общая часть «Лира & Вега & Альтаир» учитывается дважды. Используй ${String(p.left)} и ${String(p.right ?? p.both)} из таблицы.`,
      p.right !== undefined
        ? `Чтобы найти тройной запрос, из суммы ${String(p.left)} + ${String(p.right)} вычти объединение ${String(p.union)}. Ответ остаётся в тысячах.`
        : `Чтобы найти «Лира & Альтаир», из ${String(p.union)} вычти ${String(p.left)} и верни пересечение ${String(p.both)}. Ответ остаётся в тысячах.`,
    ];
    mistakes = [String(p.union + p.left), String(p.union - p.left)];
  } else if (p.kind === 'paths') {
    const names = [...new Set(p.edges.flatMap(([a, b]) => [a, b]))].sort(),
      totals = pathTotals(p);
    const incoming = (name: string) =>
      p.edges.filter(([, to]) => to === name).map(([from]) => from);
    const merge = names.find((name) => incoming(name).length > 1) ?? p.end;
    const finalPrevious = incoming(p.end);
    statement = `На рисунке показана схема дорог между городами ${names.join(', ')}. Двигаться можно только в направлении стрелок. Сколько различных путей ведёт из A в ${p.end}?`;
    steps = [
      'Положи число способов попасть в A равным 1.',
      `У города ${merge} входящие стрелки из ${incoming(merge).join(', ')}: сложи числа путей к этим городам. Получаются количества: ${names.map((name) => `${name} — ${String(totals.get(name) ?? 0)}`).join('; ')}.`,
      `Проверка у конечного города ${p.end}: ${finalPrevious.map((name) => String(totals.get(name) ?? 0)).join(' + ')} = ${answer.value}. Группы путей не пересекаются: у каждой группы своя последняя дорога.`,
    ];
    hints = [
      `Поставь у A число 1. Первые стрелки ведут из A в ${p.edges
        .filter(([from]) => from === 'A')
        .map(([, to]) => to)
        .join(', ')}; следуй их направлению.`,
      `Перед городом ${merge} учти входящие стрелки из ${incoming(merge).join(', ')}. Сложи количества путей к этим предшествующим городам.`,
      `В ${p.end} последние дороги приходят из ${finalPrevious.join(', ')}. Учти каждую из них; общий участок двух маршрутов не делает их одним путём.`,
    ];
    mistakes = [
      String(Number(answer.value) - 1),
      String(Number(answer.value) * 2),
    ];
  } else {
    const values = p.terms.map(([digits, base]) =>
      Number.parseInt(digits, base),
    );
    const decomposition = p.terms
      .map(
        ([digits, base], index) =>
          `${digits} (основание ${String(base)}): ${Array.from(digits, (digit, place) => `${String(Number.parseInt(digit, base))}·${String(base)}^${String(digits.length - place - 1)}`).join(' + ')} = ${String(values[index])}`,
      )
      .join('; ');
    const hexadecimal = p.terms.find(([, base]) => base === 16);
    const letterValues = hexadecimal
      ? [
          ...new Set(
            Array.from(hexadecimal[0]).filter((digit) => /[A-F]/u.test(digit)),
          ),
        ]
          .map((digit) => `${digit} = ${String(Number.parseInt(digit, 16))}`)
          .join(', ')
      : '';
    statement = `Вычисли значение выражения $${p.terms.map(([digits, base]) => `\\mathrm{${digits}}_{${String(base)}}`).join(' + ')}$. В ответе запиши десятичное число, основание указывать не нужно.`;
    steps = [
      `Разложи каждое число по степеням его основания, начиная справа со степени 0: ${decomposition}.`,
      p.terms
        .map(
          ([digits, base], i) =>
            `${digits} (основание ${String(base)}) = ${String(values[i])}`,
        )
        .join('; ') + '.',
      `${values.join(' + ')} = ${answer.value}.`,
    ];
    hints = [
      `Перед сложением переведи ${p.terms.map(([digits, base]) => `${digits} из основания ${String(base)}`).join('; ')} в десятичную систему.`,
      hexadecimal
        ? `Для ${hexadecimal[0]} по основанию 16 используй веса 1, 16, 256 и далее справа налево.${letterValues ? ` Значения букв: ${letterValues}.` : ' Каждая цифра умножается на вес своего разряда.'}`
        : `Для ${p.terms[0]?.[0] ?? ''} используй степени основания ${String(p.terms[0]?.[1])}, начиная справа со степени 0.`,
      `После перевода сложи десятичные значения: ${values.join(' + ')}. В ответе запиши только сумму, без основания.`,
    ];
    const octal = p.terms.find(([, base]) => base === 8)?.[0];
    if (!octal) throw new Error('В сумме нужно восьмеричное слагаемое.');
    mistakes = [
      String(Number(answer.value) - (values[0] ?? 1)),
      String(Number(answer.value) - Number.parseInt(octal, 8) + Number(octal)),
    ];
  }
  const explanations: Record<ExamShortProblem['kind'], [string, string]> = {
    'deleted-word': [
      'Проверь длину слова с учётом двух удалённых разделителей и байтов на символ.',
      'Длина этого слова даёт другое уменьшение текста. Запятая и пробел также занимают память.',
    ],
    logic: [
      'Пропущена граничная точка. Проверь строгость сравнений и действие НЕ.',
      'Добавлена лишняя точка. Проверь истинность всего выражения, а не одного сравнения.',
    ],
    roads: [
      'Полученная длина не минимальна. Сравни суммы длин дорог во всех подходящих маршрутах.',
      'Не нужно считать путь туда и обратно. Требуется расстояние от A до конечного пункта.',
    ],
    decode: [
      p.kind === 'decode' && p.repeatedOnly
        ? 'Повторяющуюся букву нужно записать один раз, без дубликатов.'
        : 'Добавлена буква, для которой нет кодового блока в сигнале.',
      'Пропущена часть ответа: проверь все кодовые блоки и повторяющиеся буквы.',
    ],
    executor: [
      'Эта последовательность команд не даёт требуемое последнее число. Проверь её прямым исполнением.',
      'Другой порядок или другое число команд меняет результат. Сверь каждое промежуточное значение.',
    ],
    'program-parameter': [
      'Проверь строгую границу сравнения и требуемое число YES на всех девяти парах.',
      p.kind === 'program-parameter' && p.mode === 'any'
        ? 'Выбранное A должно давать требуемое число YES на всей серии запусков; проверь оба сравнения.'
        : 'Условие на число YES и требование наименьшего/наибольшего A нужно выполнить одновременно.',
    ],
    url: [
      'Метки записаны в обратном порядке: сначала нужен протокол, затем сервер и путь.',
      'Один фрагмент потерян; адрес должен включать все семь частей.',
    ],
    search: [
      'Объединение и пересечение нельзя складывать как непересекающиеся множества: общие страницы учитываются повторно.',
      p.kind === 'search' && p.right === undefined
        ? 'Разность объединения и левого множества не включает их общую часть. Её нужно вернуть.'
        : 'Это правая часть вне пересечения, а нужны страницы сразу со всеми тремя словами.',
    ],
    paths: [
      'Пропущен маршрут на одной из развилок. Складывай пути от всех предшественников.',
      'Каждый путь посчитан дважды; обратное движение по дороге не разрешено.',
    ],
    numerals: [
      'Пропущено первое слагаемое после перевода в десятичную систему.',
      'Восьмеричное слагаемое прочитано как десятичное. Учитывай основание каждого числа.',
    ],
  };
  const task = taskFrom(subtype, number, seed, {
    statement,
    answer,
    solution: steps.map((text) => ({ text })),
    hints,
    commonMistakes: mistakes.map((value, i) => ({
      answer: value,
      explanation: explanations[p.kind][i] ?? '',
    })),
  });
  return {
    ...task,
    id: `${subtype}-v2:${seed}`,
    generatorId: `${subtype}-v2`,
    difficulty: examDifficulty(p, answer),
    ...(p.kind === 'paths' ? { figure: pathFigure(p) } : {}),
  };
}
/** The independent answer solver is mandatory even when canonical metadata matches. */
export function examGenerator(
  subtype: string,
  title: string,
  construct: (seed: string) => ExamConstruction,
): Generator {
  const sample = construct('metadata'),
    number = numbers[sample.problem.kind];
  return {
    id: `${subtype}-v2`,
    subtype,
    title,
    taskNumber: number,
    generate(seed) {
      const data = construct(seed);
      if (problemSubtype(data.problem) !== subtype)
        throw new Error('Подтип не совпадает с параметрами.');
      return buildExamShortTask(data, seed);
    },
    verify(task) {
      const data = construct(task.seed),
        canonical = buildExamShortTask(data, task.seed);
      return (
        JSON.stringify({ ...task, answer: undefined, figure: undefined }) ===
          JSON.stringify({
            ...canonical,
            answer: undefined,
            figure: undefined,
          }) &&
        JSON.stringify(task.figure) === JSON.stringify(canonical.figure) &&
        JSON.stringify(task.answer) ===
          JSON.stringify(solveProblem(data.problem))
      );
    },
  };
}
export { integerAnswer };
