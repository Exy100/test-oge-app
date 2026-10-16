import { Rng } from '../../rng.ts';
import { elementaryShortGenerators } from './elementary-generators.ts';
import type { Generator } from '../../types.ts';
import type {
  DecodeProblem,
  ExecutorProblem,
  ParameterProblem,
  QueryProblem,
} from './short-problems.ts';
import {
  examGenerator,
  sequenceAnswer,
  permutations,
  integerAnswer,
  type ExamConstruction,
} from './short-tasks.ts';

function decode(
  kind: 'decode-prefix' | 'decode-nonprefix' | 'decode-repeated',
): Generator {
  return examGenerator(
    kind,
    kind === 'decode-repeated'
      ? 'Повторяющиеся буквы'
      : kind === 'decode-prefix'
        ? 'Расшифровка сообщения'
        : 'Расшифровка непрефиксного кода',
    (seed) => {
      const rng = new Rng(kind + ':' + seed),
        letters = rng
          .shuffle(['А', 'Б', 'В', 'Г', 'Д', 'Е'])
          .slice(0, kind === 'decode-repeated' ? 6 : 4);
      const signals =
        kind === 'decode-prefix'
          ? ['.', '-.', '--.', '---']
          : kind === 'decode-nonprefix'
            ? ['~', '~#', '~##', '###']
            : letters.map((_, index) =>
                index
                  .toString(2)
                  .padStart(3, '0')
                  .replaceAll('0', '.')
                  .replaceAll('1', 'o'),
              );
      const codes = Object.fromEntries(
        letters.map((letter, index) => [letter, signals[index] ?? '']),
      );
      const repeated = letters.slice(0, rng.int(2, 3));
      const message =
        kind === 'decode-repeated'
          ? rng.shuffle([...letters, ...repeated]).join('')
          : Array.from({ length: rng.int(5, 10) }, () =>
              rng.pick(letters),
            ).join('');
      const problem: DecodeProblem = {
        kind: 'decode',
        codes,
        encoded: Array.from(message, (letter) => codes[letter]).join(''),
        ...(kind === 'decode-repeated' ? { repeatedOnly: true } : {}),
      };
      return {
        problem,
        message,
        answer: sequenceAnswer(
          kind === 'decode-repeated'
            ? permutations(repeated.sort().join(''))
            : [message],
          'cyrillic',
        ),
      };
    },
  );
}
function executor(square: boolean): Generator {
  const kind = square ? 'executor-square' : 'executor-multiply';
  return examGenerator(
    kind,
    square
      ? 'Программа с возведением в квадрат'
      : 'Программа с умножением и сложением',
    (seed) => {
      const rng = new Rng(kind + ':' + seed),
        start = rng.int(2, square ? 4 : 8),
        add = rng.int(1, 4),
        multiplier = rng.int(2, 3);
      const programs = new Map<number, string[]>(),
        candidates = new Set<number>();
      function visit(value: bigint, code: string): void {
        if (code && value <= 100_000n) {
          const number = Number(value),
            previous = programs.get(number) ?? [];
          programs.set(number, [...previous, code]);
          if (
            code.length >= 3 &&
            code.includes('1') &&
            code.includes('2') &&
            value <= 9999n
          )
            candidates.add(number);
        }
        if (code.length === 5) return;
        visit(square ? value * value : value * BigInt(multiplier), code + '1');
        visit(value + BigInt(add), code + '2');
      }
      visit(BigInt(start), '');
      const end = rng.pick([...candidates]),
        problem: ExecutorProblem = {
          kind: 'executor',
          start,
          end,
          add,
          limit: 5,
          ...(square ? { square: true } : { multiplier }),
        };
      return {
        problem,
        answer: sequenceAnswer(programs.get(end) ?? [], 'digits'),
      };
    },
  );
}
function parameter(mode: ParameterProblem['mode']): Generator {
  const kind = `parameter-${mode}`;
  return examGenerator(
    kind,
    mode === 'min'
      ? 'Минимальный параметр по запускам'
      : mode === 'max'
        ? 'Максимальный параметр по запускам'
        : 'Любой допустимый параметр по запускам',
    (seed) => {
      const rng = new Rng(kind + ':' + seed),
        variable = rng.pick(['s', 't'] as const),
        fixed = rng.int(3, 12),
        always = rng.int(1, 6),
        count = 9 - always;
      const values = rng
        .shuffle(Array.from({ length: 31 }, (_, n) => n - 15))
        .slice(0, count)
        .sort((a, b) => a - b);
      const cut =
        mode === 'min'
          ? rng.int(1, count)
          : mode === 'max'
            ? rng.int(0, count - 1)
            : rng.int(0, count);
      const min = cut ? values[cut - 1] : undefined,
        maxValue = cut < count ? values[cut] : undefined,
        max = maxValue === undefined ? undefined : maxValue - 1;
      const pairs: [number, number][] = values.map((value) =>
        variable === 's'
          ? [value, rng.int(fixed - 8, fixed)]
          : [rng.int(fixed - 8, fixed), value],
      );
      for (let n = 0; n < always; n++)
        pairs.push(
          variable === 's'
            ? [rng.int(-15, 15), rng.int(fixed + 1, fixed + 8)]
            : [rng.int(fixed + 1, fixed + 8), rng.int(-15, 15)],
        );
      const problem: ParameterProblem = {
        kind: 'program-parameter',
        pairs: rng.shuffle(pairs),
        variable,
        fixed,
        mode,
        yes: always + count - cut,
      };
      const value = mode === 'max' ? max : (min ?? max);
      if (value === undefined)
        throw new Error('Не построена граница параметра.');
      return {
        problem,
        answer: {
          type: 'integer',
          value: String(value),
          ...(mode === 'any'
            ? {
                acceptedRange: {
                  ...(min !== undefined ? { min: String(min) } : {}),
                  ...(max !== undefined ? { max: String(max) } : {}),
                },
              }
            : {}),
        },
      };
    },
  );
}
const url = examGenerator(
  'url-fragments',
  'Адрес файла: цифровые метки',
  (seed): ExamConstruction => {
    const rng = new Rng('url-fragments:' + seed),
      protocol = rng.pick(['ftp', 'http', 'https']),
      host = rng.pick(['atlas', 'smile', 'school', 'paper']),
      tld = rng.pick(['ru', 'com', 'info']),
      ext = rng.pick(['txt', 'jpg', 'xls', 'htm']),
      form = rng.int(0, 2);
    const filename =
      form === 2
        ? tld
        : form === 1
          ? protocol
          : rng.pick(['notes', 'result', 'data', 'hello']);
    const segments =
      form === 0
        ? [protocol, '://', host + '.', tld, '/', filename, '.' + ext]
        : [protocol, '://', host, '.' + tld, '/', filename + '.', ext];
    const fragments = rng.shuffle(segments);
    return {
      problem: {
        kind: 'url',
        target: `${protocol}://${host}.${tld}/${filename}.${ext}`,
        fragments,
      },
      answer: sequenceAnswer(
        [
          segments
            .map((fragment) => String(fragments.indexOf(fragment) + 1))
            .join(''),
        ],
        'digits',
      ),
    };
  },
);
function query(triple: boolean): Generator {
  const kind = triple ? 'search-conditional-triple' : 'search-conditional-pair';
  return examGenerator(
    kind,
    triple
      ? 'Тройное пересечение запросов'
      : 'Пересечение по условному объединению',
    (seed) => {
      const rng = new Rng(kind + ':' + seed),
        onlyLeft = rng.int(1, 50) * 10,
        both = rng.int(1, 50) * 10;
      let onlyRight = rng.int(1, 50) * 10;
      if (onlyRight === both) onlyRight += 10;
      const left = onlyLeft + both,
        right = onlyRight + both,
        union = onlyLeft + both + onlyRight;
      const problem: QueryProblem = {
        kind: 'search',
        union,
        left,
        ...(triple ? { right } : { both }),
      };
      return { problem, answer: integerAnswer(triple ? both : right) };
    },
  );
}
const paths = examGenerator(
  'paths-diagram',
  'Количество путей на схеме',
  (seed) => {
    const rng = new Rng('paths-diagram:' + seed),
      size = rng.int(7, 8),
      density = rng.pick([0.1, 0.3, 0.55]);
    const names = [
        'A',
        ...rng.shuffle(
          Array.from({ length: size - 2 }, (_, n) =>
            String.fromCharCode(66 + n),
          ),
        ),
        String.fromCharCode(64 + size),
      ],
      edges: [string, string][] = [];
    for (let from = 0; from < size - 1; from++)
      for (let to = from + 1; to < size; to++)
        if (to === from + 1 || rng.chance(density))
          edges.push([names[from] ?? '', names[to] ?? '']);
    let total = 0;
    const end = names[size - 1] ?? '';
    function visit(at: string): void {
      if (at === end) total++;
      else for (const [a, b] of edges) if (a === at) visit(b);
    }
    visit('A');
    return {
      problem: { kind: 'paths', edges, end },
      answer: integerAnswer(total),
    };
  },
);
const numerals = examGenerator(
  'numeral-sum',
  'Сумма чисел в разных системах',
  (seed) => {
    const rng = new Rng('numeral-sum:' + seed),
      cap = rng.pick([31, 127, 1023]),
      values = [rng.int(8, cap), rng.int(8, cap), rng.int(8, cap)];
    const terms: [string, number][] = [2, 8, 16].map((base, i) => [
      (values[i] ?? 0).toString(base).toUpperCase(),
      base,
    ]);
    return {
      problem: { kind: 'numerals', terms },
      answer: integerAnswer(values.reduce((sum, value) => sum + value, 0)),
    };
  },
);
export const confirmedShortGenerators: readonly Generator[] = [
  ...elementaryShortGenerators,
  decode('decode-prefix'),
  decode('decode-nonprefix'),
  decode('decode-repeated'),
  executor(false),
  executor(true),
  parameter('min'),
  parameter('max'),
  parameter('any'),
  url,
  query(true),
  query(false),
  paths,
  numerals,
];
