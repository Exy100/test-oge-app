/** Parameters and published answers only. No official statements enter the app. */
import type { CorrectAnswer, TaskNumber } from '../../../src/core/types';

export type Year = 2025 | 2026 | 2027;
export type Predicate =
  | readonly ['gt' | 'ge' | 'le' | 'eq', number]
  | readonly ['odd']
  | readonly ['not', Predicate]
  | readonly ['and' | 'or', Predicate, Predicate];
export type Parameters =
  | {
      kind: 'deleted-word';
      bits: number;
      bytes: number;
      words: readonly string[];
    }
  | {
      kind: 'decode';
      codes: Readonly<Record<string, string>>;
      encoded: string;
      repeatedOnly?: boolean;
    }
  | { kind: 'logic'; predicate: Predicate; mode: 'count-true' | 'min-false' }
  | {
      kind: 'roads';
      edges: readonly (readonly [string, string, number])[];
      end: string;
    }
  | {
      kind: 'executor';
      start: number;
      end: number;
      multiplier?: number;
      square?: boolean;
      add: number;
      limit: number;
    }
  | {
      kind: 'program-parameter';
      pairs: readonly (readonly [number, number])[];
      variable: 's' | 't';
      fixed: number;
      mode: 'min' | 'max' | 'any';
      yes: number;
    }
  | { kind: 'url'; target: string; fragments: readonly string[] }
  | {
      kind: 'search';
      union: number;
      left: number;
      right?: number;
      both?: number;
    }
  | {
      kind: 'paths';
      edges: readonly (readonly [string, string])[];
      end: string;
    }
  | { kind: 'numerals'; terms: readonly (readonly [string, number])[] }
  | { kind: 'file-search'; author: string; needles: readonly string[] }
  | {
      kind: 'file-selection';
      folders: readonly string[];
      extensions: readonly string[];
    };
export interface ShortFixture {
  id: string;
  year: Year;
  taskNumber: TaskNumber;
  page: number;
  answerPage: number;
  format: Exclude<CorrectAnswer['type'], 'artifact'>;
  answers: readonly string[];
  parameters: Parameters;
}
function fixture(
  year: Year,
  taskNumber: TaskNumber,
  format: ShortFixture['format'],
  answers: readonly string[],
  parameters: Parameters,
): ShortFixture {
  return {
    id: `D${String(year)}-${String(taskNumber).padStart(2, '0')}`,
    year,
    taskNumber,
    page:
      taskNumber <= 2
        ? 4
        : taskNumber <= 5
          ? 5
          : taskNumber === 6
            ? 6
            : taskNumber <= 8
              ? 7
              : taskNumber <= 10
                ? 8
                : 9,
    answerPage: year === 2027 ? 18 : 17,
    format,
    answers,
    parameters,
  };
}
const oldPairs = [
  [13, 2],
  [11, 12],
  [-12, 12],
  [2, -2],
  [-10, -10],
  [6, -5],
  [2, 8],
  [9, 10],
  [1, 13],
] as const;
const oldRoads = [
  ['A', 'B', 2],
  ['A', 'C', 6],
  ['A', 'E', 8],
  ['B', 'C', 3],
  ['C', 'D', 5],
  ['C', 'E', 2],
  ['D', 'E', 3],
] as const;

export const shortFixtures: readonly ShortFixture[] = [
  fixture(2025, 1, 'word', ['раскладушка'], {
    kind: 'deleted-word',
    bits: 8,
    bytes: 13,
    words: [
      'пуф',
      'стул',
      'диван',
      'кресло',
      'кровать',
      'тумбочка',
      'оттоманка',
      'полукресло',
      'раскладушка',
    ],
  }),
  fixture(2026, 1, 'word', ['Шрек'], {
    kind: 'deleted-word',
    bits: 16,
    bytes: 12,
    words: [
      'Шрек',
      'Пумба',
      'Маугли',
      'Рататуй',
      'Пиноккио',
      'Винни-Пух',
      'Белоснежка',
      'Малефисента',
      'Человек-паук',
      'Конёк-Горбунок',
    ],
  }),
  fixture(2027, 1, 'word', ['физика'], {
    kind: 'deleted-word',
    bits: 16,
    bytes: 16,
    words: [
      'ОБЖ',
      'химия',
      'физика',
      'алгебра',
      'биология',
      'география',
      'литература',
      'информатика',
    ],
  }),
  fixture(2025, 2, 'sequence', ['АБ', 'БА'], {
    kind: 'decode',
    codes: {
      А: '..o..',
      Б: '.o..o',
      В: '.oo.o',
      Г: '.oooo',
      Д: '...o.',
      Е: '.o.oo',
    },
    encoded: '.o..o.o.oo.o..o..o....o..',
    repeatedOnly: true,
  }),
  fixture(2026, 2, 'sequence', ['АДЖЛДЛАЛ'], {
    kind: 'decode',
    codes: { А: '.-', Д: '-..', Ж: '.-..', Л: '-', Т: '...-' },
    encoded: '.--...-..--..-.--',
  }),
  fixture(2027, 2, 'sequence', ['БАВГ'], {
    kind: 'decode',
    codes: { А: '~', Б: '#', В: '#+', Г: '+~#', Д: '+#', Е: '~#' },
    encoded: '#~#++~#',
  }),
  fixture(2025, 3, 'integer', ['10'], {
    kind: 'logic',
    predicate: ['and', ['not', ['gt', 19]], ['odd']],
    mode: 'count-true',
  }),
  fixture(2026, 3, 'integer', ['3'], {
    kind: 'logic',
    predicate: [
      'or',
      ['gt', 3],
      ['not', ['and', ['not', ['ge', 4]], ['gt', 2]]],
    ],
    mode: 'min-false',
  }),
  fixture(2027, 3, 'integer', ['8'], {
    kind: 'logic',
    predicate: [
      'or',
      ['and', ['not', ['ge', 6]], ['not', ['eq', 5]]],
      ['le', 7],
    ],
    mode: 'min-false',
  }),
  fixture(2025, 4, 'integer', ['10'], {
    kind: 'roads',
    edges: oldRoads,
    end: 'D',
  }),
  fixture(2026, 4, 'integer', ['7'], {
    kind: 'roads',
    edges: [
      ['A', 'B', 2],
      ['A', 'C', 4],
      ['A', 'E', 6],
      ['B', 'C', 1],
      ['C', 'D', 5],
      ['C', 'E', 1],
      ['D', 'E', 3],
    ],
    end: 'D',
  }),
  fixture(2027, 4, 'integer', ['9'], {
    kind: 'roads',
    edges: [
      ['A', 'B', 2],
      ['A', 'C', 3],
      ['A', 'D', 7],
      ['A', 'F', 15],
      ['B', 'D', 3],
      ['C', 'D', 1],
      ['D', 'E', 2],
      ['D', 'F', 11],
      ['E', 'F', 3],
    ],
    end: 'F',
  }),
  fixture(2025, 5, 'sequence', ['12112'], {
    kind: 'executor',
    start: 4,
    end: 47,
    multiplier: 2,
    add: 3,
    limit: 5,
  }),
  fixture(2026, 5, 'sequence', ['11222'], {
    kind: 'executor',
    start: 3,
    end: 84,
    square: true,
    add: 1,
    limit: 5,
  }),
  fixture(2027, 5, 'sequence', ['12122'], {
    kind: 'executor',
    start: 3,
    end: 37,
    multiplier: 3,
    add: 2,
    limit: 5,
  }),
  fixture(2025, 6, 'integer', ['13'], {
    kind: 'program-parameter',
    pairs: oldPairs,
    variable: 's',
    fixed: 12,
    mode: 'min',
    yes: 1,
  }),
  fixture(2026, 6, 'integer', ['8'], {
    kind: 'program-parameter',
    pairs: oldPairs,
    variable: 's',
    fixed: 12,
    mode: 'max',
    yes: 4,
  }),
  fixture(2027, 6, 'integer', ['10'], {
    kind: 'program-parameter',
    pairs: [
      [1, 2],
      [11, 2],
      [1, 12],
      [11, 12],
      [-11, -12],
      [-11, 12],
      [-12, 11],
      [10, 10],
      [10, 5],
    ],
    variable: 't',
    fixed: 10,
    mode: 'any',
    yes: 5,
  }),
  fixture(2025, 7, 'sequence', ['6231457'], {
    kind: 'url',
    target: 'ftp://home.info/hello.jpg',
    fragments: ['info', '://', 'home.', '/', 'hello', 'ftp', '.jpg'],
  }),
  fixture(2026, 7, 'sequence', ['1735246'], {
    kind: 'url',
    target: 'https://smile.ru/https.txt',
    fragments: ['https', '/', 'smile', 'https.', '.ru', 'txt', '://'],
  }),
  fixture(2027, 7, 'sequence', ['4751632'], {
    kind: 'url',
    target: 'http://tt.com/com.xls',
    fragments: ['com', 'xls', 'com.', 'http', 'tt.', '/', '://'],
  }),
  fixture(2025, 8, 'integer', ['110'], {
    kind: 'search',
    union: 420,
    left: 220,
    right: 310,
  }),
  fixture(2026, 8, 'integer', ['440'], {
    kind: 'search',
    union: 840,
    left: 530,
    both: 130,
  }),
  fixture(2027, 8, 'integer', ['470'], {
    kind: 'search',
    union: 800,
    left: 550,
    both: 220,
  }),
  fixture(2025, 9, 'integer', ['10'], {
    kind: 'paths',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['A', 'D'],
      ['A', 'E'],
      ['B', 'E'],
      ['C', 'D'],
      ['C', 'G'],
      ['D', 'F'],
      ['D', 'G'],
      ['E', 'F'],
      ['G', 'F'],
      ['G', 'H'],
      ['F', 'H'],
    ],
    end: 'H',
  }),
  fixture(2026, 9, 'integer', ['10'], {
    kind: 'paths',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['A', 'D'],
      ['B', 'E'],
      ['C', 'E'],
      ['C', 'F'],
      ['D', 'F'],
      ['E', 'F'],
      ['E', 'G'],
      ['F', 'G'],
      ['F', 'H'],
      ['G', 'H'],
    ],
    end: 'H',
  }),
  fixture(2027, 9, 'integer', ['7'], {
    kind: 'paths',
    edges: [
      ['A', 'B'],
      ['A', 'D'],
      ['B', 'C'],
      ['B', 'D'],
      ['B', 'E'],
      ['C', 'E'],
      ['C', 'G'],
      ['D', 'E'],
      ['D', 'F'],
      ['E', 'F'],
      ['F', 'G'],
    ],
    end: 'G',
  }),
  fixture(2025, 10, 'integer', ['1039'], {
    kind: 'numerals',
    terms: [
      ['10111101', 2],
      ['1101', 8],
      ['111', 16],
    ],
  }),
  fixture(2026, 10, 'integer', ['904'], {
    kind: 'numerals',
    terms: [
      ['110111', 2],
      ['1101', 8],
      ['110', 16],
    ],
  }),
  fixture(2027, 10, 'integer', ['1032'], {
    kind: 'numerals',
    terms: [
      ['10111111', 2],
      ['1110', 8],
      ['101', 16],
    ],
  }),
  fixture(2025, 11, 'word', ['ТЩЕТНЫЙ'], {
    kind: 'file-search',
    author: 'Чехов',
    needles: ['взятый приучаться', 'щенок'],
  }),
  fixture(2026, 11, 'word', ['Плюшкин'], {
    kind: 'file-search',
    author: 'Гоголь',
    needles: ['Мавра', 'разбойница'],
  }),
  fixture(2027, 11, 'word', ['городовой'], {
    kind: 'file-search',
    author: 'Чехов',
    needles: ['Елдырин'],
  }),
  fixture(2025, 12, 'integer', ['6'], {
    kind: 'file-selection',
    folders: ['Поэзия/Есенин', 'Поэзия/Лермонтов'],
    extensions: ['.htm'],
  }),
  fixture(2026, 12, 'integer', ['8'], {
    kind: 'file-selection',
    folders: ['Живопись/Верещагин', 'Живопись/Малевич', 'Поэзия/Лермонтов'],
    extensions: ['.htm', '.tiff'],
  }),
  fixture(2027, 12, 'integer', ['8'], {
    kind: 'file-selection',
    folders: [
      'Живопись/Васнецов',
      'Живопись/Верещагин',
      'Проза/Куприн',
      'Проза/Пушкин',
    ],
    extensions: ['.jpeg', '.pdf'],
  }),
];

export function answerFormat(
  fixture: ShortFixture,
  value = fixture.answers[0] ?? '',
): CorrectAnswer {
  if (fixture.format === 'integer') return { type: 'integer', value };
  if (fixture.format === 'word')
    return { type: 'word', value, caseSensitive: false };
  return {
    type: 'sequence',
    value,
    alphabet: fixture.taskNumber === 2 ? 'cyrillic' : 'digits',
    caseSensitive: false,
  };
}
