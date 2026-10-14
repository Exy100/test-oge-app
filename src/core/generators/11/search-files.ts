import { Rng } from '../../rng.ts';
import type { Generator, TaskInstance } from '../../types.ts';
import { taskFrom } from '../task.ts';

export type SearchKind =
  'file-quote' | 'file-word-count' | 'file-phrase-documents';
export const searchKinds: readonly SearchKind[] = [
  'file-quote',
  'file-word-count',
  'file-phrase-documents',
];
const titles: Record<SearchKind, string> = {
  'file-quote': 'Сведения по цитате в файлах',
  'file-word-count': 'Количество отдельных слов в файле',
  'file-phrase-documents': 'Документы с заданной фразой',
};
const stations = [
  'Северная',
  'Речная',
  'Лесная',
  'Горная',
  'Озёрная',
  'Степная',
];
const quotes = [
  'Лодка доставила приборы до рассвета.',
  'Наблюдатели сверили часы перед выходом.',
  'Карта маршрута лежала у окна.',
];
const phrases = ['тихий берег', 'северный ветер', 'яркий сигнал'];
const encoder = new TextEncoder();
export function isSearchKind(value: string): value is SearchKind {
  return searchKinds.some((kind) => kind === value);
}
export function searchDatasetId(kind: SearchKind, seed: string): string {
  return `${kind}-v1:files:${seed}`;
}

/** Single source for the virtual directory, archive and answer computation. */
export function searchSources(
  kind: SearchKind,
  seed: string,
): { files: Map<string, Uint8Array>; query: string } {
  const rng = new Rng(`${kind}:${seed}`);
  const files = new Map<string, Uint8Array>();
  const put = (path: string, lines: string[]) =>
    files.set(path, encoder.encode(lines.join('\n') + '\n'));
  let query: string;
  if (kind === 'file-quote') {
    query = rng.pick(quotes);
    const target = rng.int(0, 5);
    const names = rng.shuffle(stations);
    for (let i = 0; i < 6; i++)
      put(`reports/журнал-${String(i + 1)}.txt`, [
        `Станция: ${names[i] ?? ''}`,
        'Учебный журнал наблюдений. Все события вымышлены.',
        `Запись ${String(rng.int(10, 99))}. Утром участники проверили оборудование и обсудили маршрут.`,
        i === target
          ? query
          : rng.pick(quotes.filter((quote) => quote !== query)),
        'После возвращения группа записала результаты в журнал и подготовила приборы к следующему выходу.',
      ]);
  } else if (kind === 'file-word-count') {
    const choice = rng.pick([
      {
        word: 'маяк',
        near: ['маяка', 'маяки', 'маячный'],
        sentences: [
          'Вдали появился маяк.',
          'Смотритель проверил маяк перед рассветом.',
          '«Маяк!» — произнёс наблюдатель.',
          'На карте отмечен МАЯК.',
        ],
      },
      {
        word: 'робот',
        near: ['робота', 'роботы', 'робототехника'],
        sentences: [
          'На площадку выехал робот.',
          'Перед запуском робот проверил датчики.',
          '«Робот!» — объявил ведущий.',
          'В журнале записано: РОБОТ.',
        ],
      },
      {
        word: 'архив',
        near: ['архива', 'архивы', 'архивный'],
        sentences: [
          'Исследователь открыл архив.',
          'После проверки архив закрыли.',
          '«Архив!» — прочитал участник.',
          'На папке написано: АРХИВ.',
        ],
      },
    ]);
    query = choice.word;
    const count = rng.int(4, 12);
    const paragraphs = Array.from(
      { length: count },
      (_, i) => choice.sentences[i % choice.sentences.length] ?? '',
    );
    paragraphs.push(
      `Слова для словаря: ${choice.near.join(', ')}.`,
      'Участники работали спокойно. В конце дня они обсудили результаты и составили новый план.',
    );
    put('texts/рассказ.txt', ['Учебная история', ...rng.shuffle(paragraphs)]);
    put('notes/заметка.txt', [
      `${query} ${query} ${query}`,
      'Эта заметка не входит в область поиска.',
    ]);
  } else {
    query = rng.pick(phrases);
    const near =
      (
        {
          'тихий берег': 'тихий береговой участок',
          'северный ветер': 'северный ветерок',
          'яркий сигнал': 'яркий сигнальный огонь',
        } as Record<string, string>
      )[query] ?? '';
    const selected = new Set(
      rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, rng.int(2, 4)),
    );
    for (let i = 0; i < 6; i++) {
      const lines = [
        `Документ ${String(i + 1)}. Учебный отчёт о наблюдениях.`,
        'Участники сравнили записи и составили описание маршрута.',
      ];
      const repeats = rng.int(2, 3);
      if (selected.has(i))
        for (let repeat = 0; repeat < repeats; repeat++)
          lines.push(
            `Наблюдение: ${repeat === 0 ? query.toUpperCase() : query}.`,
          );
      else
        lines.push(
          `Справочная строка: ${query.replace(' ', '  ')}.`,
          `В отчёте упомянут ${near}.`,
        );
      lines.push('Отчёт завершён. Приборы возвращены в лабораторию.');
      put(`reports/отчёт-${String(i + 1)}.txt`, lines);
    }
    put('notes/справка.txt', [
      `Фраза для справки: ${query}.`,
      'Эта папка не входит в область поиска.',
    ]);
  }
  put('README.txt', [
    'Авторский учебный набор для задания №11.',
    'Все тексты и названия станций вымышлены. Лицензия: CC0-1.0.',
    'Файлы имеют кодировку UTF-8. Распакуй архив и открой тексты в редакторе.',
    'Область поиска и правила совпадения указаны в условии задачи. Ответов в этом файле нет.',
  ]);
  return { files, query };
}
function texts(files: ReadonlyMap<string, Uint8Array>): [string, string][] {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return [...files].map(([path, bytes]) => [path, decoder.decode(bytes)]);
}
function literalMatches(text: string, query: string): number {
  // Escaping also preserves punctuation in exact quotations.
  const literal = query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return [
    ...text.matchAll(
      new RegExp(`(?<![А-Яа-яЁё])${literal}(?![А-Яа-яЁё])`, 'giu'),
    ),
  ].length;
}
export function answerFromFiles(
  kind: SearchKind,
  query: string,
  files: ReadonlyMap<string, Uint8Array>,
): string | null {
  const decoded = texts(files);
  if (kind === 'file-quote') {
    const matches = decoded.filter(
      ([path, text]) => path.startsWith('reports/') && text.includes(query),
    );
    return matches.length === 1
      ? (/^Станция: ([А-ЯЁа-яё]+)$/mu.exec(matches[0]?.[1] ?? '')?.[1] ?? null)
      : null;
  }
  if (kind === 'file-word-count') {
    const text = decoded.find(([path]) => path === 'texts/рассказ.txt')?.[1];
    return text === undefined ? null : String(literalMatches(text, query));
  }
  return String(
    decoded.filter(
      ([path, text]) =>
        path.startsWith('reports/') && literalMatches(text, query) > 0,
    ).length,
  );
}
function searchFiles(kind: SearchKind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 11,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const { files, query } = searchSources(kind, seed);
      const result = answerFromFiles(kind, query, files);
      if (result === null)
        throw new Error('Неоднозначный или неполный набор файлов.');
      const question =
        kind === 'file-quote'
          ? `В файлах папки reports найди точную цитату «${query}». Из первой строки найденного файла выпиши название станции. Ответ — одно слово русскими буквами; регистр не учитывается.`
          : kind === 'file-word-count'
            ? `В файле texts/рассказ.txt посчитай отдельное слово «${query}» без учёта регистра. Слово — непрерывная последовательность русских букв А–Я, а–я, Ё, ё. Другие формы слова и другие файлы не учитывай. Ответ запиши целым числом.`
            : `В скольких TXT-файлах папки reports встречается фраза «${query}» без учёта регистра? Между словами должен быть ровно один обычный пробел; снаружи фразы не должно быть соседних русских букв. Другие папки не учитывай. Каждый подходящий файл считай один раз, независимо от числа совпадений. Ответ запиши целым числом.`;
      const hits = texts(files).filter(([path, text]) =>
        kind === 'file-quote'
          ? path.startsWith('reports/') && text.includes(query)
          : kind === 'file-word-count'
            ? path === 'texts/рассказ.txt'
            : path.startsWith('reports/') && literalMatches(text, query) > 0,
      );
      const occurrences = hits.reduce(
        (sum, [, text]) => sum + literalMatches(text, query),
        0,
      );
      return {
        ...taskFrom(kind, 11, seed, {
          statement: `Скачай и распакуй файловый набор этого задания. Тексты — авторские, кодировка UTF-8; подключение к Интернету для поиска не требуется.\n\n${question}`,
          answer:
            kind === 'file-quote'
              ? { type: 'word', value: result, caseSensitive: false }
              : { type: 'integer', value: result },
          solution: [
            {
              text:
                kind === 'file-word-count'
                  ? 'Открой только texts/рассказ.txt. Включи поиск целого слова без учёта регистра.'
                  : 'Открой папку reports. Ищи указанную строку по правилам условия, не включая notes и README.txt.',
            },
            {
              text: `Подходящие файлы: ${hits.map(([path]) => path).join(', ')}.`,
            },
            {
              text:
                kind === 'file-quote'
                  ? `Первая строка найденного журнала: Станция: ${result}. Ответ: ${result}.`
                  : kind === 'file-word-count'
                    ? `В указанном файле найдено ${result} отдельных слов. Однокоренные слова и заметка из другой папки исключены. Ответ: ${result}.`
                    : `Найдено ${String(occurrences)} вхождений, но подходящих файлов только ${result}. Ответ: ${result}.`,
            },
          ],
          hints: [
            'Сначала проверь папку или имя файла из условия.',
            kind === 'file-quote'
              ? 'Ищи всю цитату целиком; похожий текст не подходит.'
              : 'Учитывай границы слов и правило регистра.',
            kind === 'file-quote'
              ? 'Нужно название станции из первой строки, а не имя файла.'
              : kind === 'file-word-count'
                ? 'Не включай другие формы слова и совпадения из соседних файлов.'
                : 'Повтор фразы в том же файле не увеличивает число подходящих документов.',
          ],
          commonMistakes:
            kind === 'file-quote'
              ? [
                  {
                    answer:
                      stations.find((station) => station !== result) ??
                      'Северная',
                    explanation:
                      'Выбрана станция из другого журнала. Проверь точное совпадение цитаты.',
                  },
                  {
                    answer: hits[0]?.[0] ?? 'журнал',
                    explanation:
                      'Это имя файла; требуется название станции из его первой строки.',
                  },
                ]
              : [
                  {
                    answer: String(
                      kind === 'file-word-count'
                        ? Number(result) + 3
                        : occurrences,
                    ),
                    explanation:
                      kind === 'file-word-count'
                        ? 'Добавлены совпадения из notes/заметка.txt, которая не входит в область поиска.'
                        : 'Посчитаны вхождения фразы, а не документы.',
                  },
                  {
                    answer: String(Number(result) - 1),
                    explanation:
                      'Пропущено подходящее совпадение. Проверь весь указанный набор и варианты регистра.',
                  },
                ],
        }),
        datasetId: searchDatasetId(kind, seed),
      };
    },
    verify(task: TaskInstance) {
      if (
        task.datasetId !== searchDatasetId(kind, task.seed) ||
        task.generatorId !== `${kind}-v1`
      )
        return false;
      const { files, query } = searchSources(kind, task.seed);
      if (!task.statement.includes(`«${query}»`)) return false;
      const decoded = texts(files);
      // Alternative scanning: line search / token arrays / bounded literal positions.
      let expected: string;
      if (kind === 'file-quote') {
        if (
          task.answer.type !== 'word' ||
          !task.statement.includes('название станции')
        )
          return false;
        const matches = decoded.filter(
          ([path, text]) =>
            path.startsWith('reports/') &&
            text.split('\n').some((line) => line === query),
        );
        if (matches.length !== 1) return false;
        expected = matches[0]?.[1].split('\n')[0]?.split(': ')[1] ?? '';
      } else if (kind === 'file-word-count') {
        if (
          task.answer.type !== 'integer' ||
          !task.statement.includes('В файле texts/рассказ.txt')
        )
          return false;
        const text =
          decoded.find(([path]) => path === 'texts/рассказ.txt')?.[1] ?? '';
        expected = String(
          text
            .toLowerCase()
            .split(/[^а-яё]+/u)
            .filter((word) => word === query).length,
        );
      } else {
        if (
          task.answer.type !== 'integer' ||
          !task.statement.includes('Каждый подходящий файл считай один раз')
        )
          return false;
        expected = String(
          decoded.filter(([path, text]) => {
            if (!path.startsWith('reports/')) return false;
            const lower = text.toLowerCase();
            for (
              let pos = lower.indexOf(query);
              pos !== -1;
              pos = lower.indexOf(query, pos + 1)
            ) {
              if (
                !/[а-яё]/u.test(lower[pos - 1] ?? '') &&
                !/[а-яё]/u.test(lower[pos + query.length] ?? '')
              )
                return true;
            }
            return false;
          }).length,
        );
      }
      return expected === task.answer.value;
    },
  };
}
export const fileQuote = searchFiles('file-quote');
export const fileWordCount = searchFiles('file-word-count');
export const filePhraseDocuments = searchFiles('file-phrase-documents');
