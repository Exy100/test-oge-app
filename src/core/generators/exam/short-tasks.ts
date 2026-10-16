import type {
  CorrectAnswer,
  FigureSpec,
  Generator,
  TaskInstance,
} from '../../types.ts';
import { taskFrom, quantity } from '../task.ts';
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
    statement = `В кодировке каждый символ занимает ${String(p.bits)} бит. Записан список слов: «${p.words.join(', ')}». Одно слово удалили вместе с лишними запятой и пробелом; двойных пробелов не осталось. Размер текста уменьшился на ${String(p.bytes)} байт. Какое слово удалили?`;
    const letters = (p.bytes * 8) / p.bits - 2;
    steps = [
      `Один символ занимает ${String(p.bits / 8)} байт. Удалено ${String((p.bytes * 8) / p.bits)} символов.`,
      `Запятая и пробел — ещё два символа. В слове ${String(letters)} букв (дефис, если он есть, тоже символ).`,
      `В списке такую длину имеет слово «${answer.value}». Проверка: (${String(answer.value.length)} + 2) · ${String(p.bits / 8)} = ${String(p.bytes)} байт.`,
    ];
    hints = [
      'Переведи биты на символ в байты на символ.',
      'Учти два удалённых разделителя.',
      'Сравни число оставшихся символов с длинами слов.',
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
    steps =
      p.mode === 'count-true'
        ? [
            'Раскрой НЕ и учитывай скобки: для И нужны оба условия, для ИЛИ достаточно одного.',
            `Подходящие натуральные X: ${
              Array.from({ length: 1001 }, (_, i) => i + 1)
                .filter((x) => logicHolds(p.predicate, x))
                .join(', ') || 'нет'
            }.`,
            `Количество подходящих значений: ${answer.value}. Ноль в натуральные числа не включён.`,
          ]
        : [
            'Нужно ложное значение всего выражения. Разбирай операции с учётом скобок.',
            `При X = ${answer.value} выражение ${logicHolds(p.predicate, value) ? 'истинно' : 'ложно'}. При меньших натуральных X оно истинно.`,
            `Первое ложное значение достигается при X = ${answer.value}.`,
          ];
    hints = [
      'Сначала выполни сравнения в скобках.',
      'НЕ меняет истину на ложь и наоборот; проверь строгость границ.',
      p.mode === 'count-true'
        ? 'Найди все подходящие натуральные X и посчитай их.'
        : 'Проверь границу и ближайшее меньшее натуральное число.',
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
    steps = [
      'Начни с расстояния 0 до A. Для соседнего пункта сравни уже найденный путь и путь через текущий пункт.',
      `Минимальные расстояния от A: ${names.map((name) => `${name} — ${String(distances.get(name))}`).join('; ')} км.`,
      `Минимальная суммарная длина до ${p.end} равна ${answer.value} км. Число дорог само по себе длину пути не определяет.`,
    ];
    hints = [
      'Используй только дороги с числом в таблице.',
      'Суммируй длины, а не количество дорог.',
      'Сравни все возможные подходы к конечному пункту.',
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
    steps = [
      'Разбирай весь сигнал по таблице: короткий код не всегда определяет границу следующей буквы.',
      `Разбиение: ${Array.from(message, (letter) => p.codes[letter]).join(' / ')}. Сообщение: ${message}.`,
      p.repeatedOnly
        ? `Число вхождений: ${[...new Set(message)].map((letter) => `${letter} — ${String(Array.from(message).filter((item) => item === letter).length)}`).join('; ')}. Повторяющиеся буквы: ${answer.value}; их порядок в ответе произвольный.`
        : `Соедини буквы в порядке кодовых блоков: ${answer.value}.`,
    ];
    hints = [
      'Сопоставь начальные знаки сигнала с кодами таблицы.',
      'Если код — начало другого кода, проверь оба продолжения до конца сигнала.',
      p.repeatedOnly
        ? 'Каждую повторяющуюся букву записывай один раз.'
        : 'Сохрани порядок всех букв.',
    ];
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
      `Проверяй программы от одной команды до ${String(p.limit)}. Сохраняй порядок действий.`,
      `Один подходящий вариант — ${answer.value}: ${trace.join(' → ')}.`,
      `Последнее значение равно ${String(p.end)}, длина программы ${String(answer.value.length)} не превышает ${String(p.limit)}. Другие подходящие программы также принимаются.`,
    ];
    hints = [
      'Начни с последнего числа и выполни обратное действие.',
      p.square
        ? 'Обратный шаг квадрата допустим только для полного квадрата.'
        : 'Перед обратным делением проверь делимость.',
      'Проверь весь найденный код прямым исполнением и посчитай команды.',
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
    const interval =
      answer.type === 'integer' ? answer.acceptedRange : undefined;
    const rangeText = [
      interval?.min !== undefined ? `A ≥ ${interval.min}` : null,
      interval?.max !== undefined ? `A ≤ ${interval.max}` : null,
    ]
      .filter((part) => part !== null)
      .join(' и ');
    steps = [
      'Отдели запуски, где сравнение с постоянной границей уже даёт YES независимо от A.',
      `При A = ${answer.value} результаты девяти запусков: ${p.pairs.map(([s, t]) => ((p.variable === 's' ? s > a || t > p.fixed : s > p.fixed || t > a) ? 'YES' : 'NO')).join(', ')}. Получено ${String(p.yes)} YES.`,
      p.mode === 'any'
        ? `Подходит каждое целое ${rangeText}. Например, ${answer.value}.`
        : `Сравнение строгое: значение на границе уже меняет число YES. Поэтому ${p.mode === 'min' ? 'первое' : 'последнее'} подходящее целое A равно ${answer.value}.`,
    ];
    hints = [
      'Каждая пара — отдельный запуск; A во всех запусках одинаково.',
      'Для or достаточно хотя бы одного истинного сравнения.',
      'Отсортируй существенные значения переменной и проверь границы между ними.',
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
      `Порядок частей URL: протокол, ://, сервер, /, имя файла.`,
      `Полный адрес: ${p.target}.`,
      `Замени его части цифрами из таблицы: ${answer.value}. Проверь, что использованы все семь фрагментов.`,
    ];
    hints = [
      'Начни с протокола и ://.',
      'Расширение файла не является доменом сервера.',
      'Собери адрес полностью и только затем запиши метки.',
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
      'Рассмотри два множества: страницы с Лирой и Вегой и страницы с Лирой и Альтаиром.',
      'Первая строка таблицы — их объединение, тройной запрос — их пересечение.',
      p.right !== undefined
        ? `Пересечение: ${String(p.left)} + ${String(p.right)} − ${String(p.union)} = ${answer.value}.`
        : `Искомое множество: ${String(p.union)} − ${String(p.left)} + ${String(p.both)} = ${answer.value}.`,
    ];
    hints = [
      'Распредели & относительно выражения в скобках.',
      'Сумма размеров двух множеств дважды учитывает пересечение.',
      'Ответ нужен в тех же единицах, что и таблица.',
    ];
    mistakes = [String(p.union + p.left), String(p.union - p.left)];
  } else if (p.kind === 'paths') {
    const names = [...new Set(p.edges.flatMap(([a, b]) => [a, b]))].sort(),
      totals = pathTotals(p);
    statement = `На рисунке показана схема дорог между городами ${names.join(', ')}. Двигаться можно только в направлении стрелок. Сколько различных путей ведёт из A в ${p.end}?`;
    steps = [
      'Положи число способов попасть в A равным 1.',
      `Для каждого следующего города сложи числа у его непосредственных предшественников: ${names.map((name) => `${name} — ${String(totals.get(name) ?? 0)}`).join('; ')}.`,
      `Число у конечного города ${p.end} равно ${answer.value}.`,
    ];
    hints = [
      'Считай пути слева направо по стрелкам.',
      'На слиянии складывай количества путей.',
      'Разные маршруты могут иметь общие участки — это не делает их одним путём.',
    ];
    mistakes = [
      String(Number(answer.value) - 1),
      String(Number(answer.value) * 2),
    ];
  } else {
    const values = p.terms.map(([digits, base]) =>
      Number.parseInt(digits, base),
    );
    statement = `Вычисли значение выражения $${p.terms.map(([digits, base]) => `\\mathrm{${digits}}_{${String(base)}}`).join(' + ')}$. В ответе запиши десятичное число, основание указывать не нужно.`;
    steps = [
      'Переведи каждое слагаемое в десятичную систему по разрядам.',
      p.terms
        .map(
          ([digits, base], i) =>
            `${digits} (основание ${String(base)}) = ${String(values[i])}`,
        )
        .join('; ') + '.',
      `${values.join(' + ')} = ${answer.value}.`,
    ];
    hints = [
      'Основание относится только к числу перед ним.',
      'В шестнадцатеричной записи A–F обозначают 10–15.',
      'Складывай уже переведённые числа, а ответ записывай без основания.',
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
