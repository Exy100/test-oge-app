import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';

type Kind = 'url-root' | 'url-directory' | 'url-select' | 'url-move';
const titles: Record<Kind, string> = {
  'url-root': 'Адрес файла в корне сервера',
  'url-directory': 'Адрес файла в каталоге',
  'url-select': 'Адрес с лишними фрагментами',
  'url-move': 'Адрес после переноса файла',
};
const letters = 'ABCDEFGHI';

function address(kind: Kind): Generator {
  return {
    id: `${kind}-v1`,
    taskNumber: 7,
    subtype: kind,
    title: titles[kind],
    generate(seed) {
      const rng = new Rng(seed);
      const protocol = rng.pick(['http', 'https']);
      const host = rng.pick(['school', 'library', 'museum', 'college']);
      const file = rng.pick(['lesson', 'notes', 'report', 'schedule']);
      const ext = rng.pick(['pdf', 'txt', 'png']);
      const directory =
        kind === 'url-root' ? '' : rng.pick(['docs', 'files', 'materials']);
      const segments = [
        protocol,
        '://',
        host,
        '.example',
        directory ? `/${directory}/` : '/',
        file,
        `.${ext}`,
      ];
      const extra =
        kind === 'url-select'
          ? [protocol === 'https' ? 'http' : 'https', '.zip']
          : kind === 'url-move'
            ? ['/archive/', 'draft']
            : [];
      const fragments = rng.shuffle([...segments, ...extra]);
      const answer = segments
        .map((segment) => letters[fragments.indexOf(segment)])
        .join('');
      const table = [
        '| Метка | Фрагмент |',
        '| --- | --- |',
        ...fragments.map(
          (value, i) => `| ${letters[i] ?? ''} | \`${value}\` |`,
        ),
      ].join('\n');
      const facts =
        kind === 'url-move'
          ? `Исходный адрес: \`${protocol}://${host}.example/archive/draft.${ext}\`. Файл перенесли в каталог \`${directory}\` непосредственно в корне сервера и переименовали в \`${file}.${ext}\`. Протокол и сервер не изменились.`
          : `Протокол: \`${protocol}\`. Сервер: \`${host}.example\`. Файл: \`${file}.${ext}\`. ${directory ? `Каталог \`${directory}\` расположен непосредственно в корне сервера.` : 'Файл расположен в корне сервера.'}`;
      return taskFrom(kind, 7, seed, {
        statement: `${facts}\n\n${table}\n\nСоставь ${kind === 'url-move' ? 'новый ' : ''}полный адрес из фрагментов таблицы. Запиши подряд их метки — заглавные латинские буквы без пробелов. Каждый выбранный фрагмент используй ровно один раз. ${extra.length ? 'Два фрагмента лишние.' : 'Используй все фрагменты.'} Адрес не содержит порта, параметров запроса или якоря. Сервер учебный; открывать адрес не нужно.`,
        answer: {
          type: 'sequence',
          value: answer,
          alphabet: 'latin',
          caseSensitive: true,
        },
        solution: [
          {
            text: `Начало адреса — протокол, разделитель :// и имя сервера: ${protocol}://${host}.example.`,
          },
          {
            text: `Путь к файлу: ${directory ? `/${directory}/` : '/'}${file}.${ext}. ${kind === 'url-move' ? 'Старый каталог archive и старое имя draft больше не используются.' : 'Расширение относится к имени файла, а не к имени сервера.'}`,
          },
          {
            text: `Полный адрес: ${segments.join('')}. По таблице ему соответствуют метки ${answer}.`,
          },
        ],
        hints: [
          'Начни с протокола и разделителя ://.',
          'После сервера запиши путь от корня к файлу.',
          'Собери адрес целиком, затем замени фрагменты их метками.',
        ],
        commonMistakes: [
          {
            answer:
              answer.slice(0, -2) + answer.slice(-1) + answer.slice(-2, -1),
            explanation:
              'Имя файла и его расширение переставлены. Сначала пишется имя, затем точка и расширение.',
          },
          {
            answer: answer.slice(0, 4) + answer.slice(5),
            explanation:
              'Потерян фрагмент пути после имени сервера: разделитель / обязателен.',
          },
        ],
      });
    },
    verify(task) {
      if (
        task.answer.type !== 'sequence' ||
        !/^[A-I]{7}$/u.test(task.answer.value) ||
        new Set(task.answer.value).size !== 7
      )
        return false;
      const rows = [
        ...task.statement.matchAll(/^\| ([A-I]) \| `([^`\n]+)` \|$/gmu),
      ];
      if (
        rows.length !==
          (kind === 'url-select' || kind === 'url-move' ? 9 : 7) ||
        rows.some((row, i) => row[1] !== letters[i]) ||
        new Set(rows.map((row) => row[2])).size !== rows.length
      )
        return false;
      let protocol: string;
      let host: string;
      let path: string;
      if (kind === 'url-move') {
        const match =
          /^Исходный адрес: `(https?):\/\/([a-z]+\.example)\/archive\/draft\.([a-z]+)`\. Файл перенесли в каталог `([a-z]+)` непосредственно в корне сервера и переименовали в `([a-z]+\.[a-z]+)`\. Протокол и сервер не изменились\./u.exec(
            task.statement,
          );
        if (!match) return false;
        protocol = match[1] ?? '';
        host = match[2] ?? '';
        path = `/${match[4] ?? ''}/${match[5] ?? ''}`;
      } else {
        const match =
          /^Протокол: `(https?)`\. Сервер: `([a-z]+\.example)`\. Файл: `([a-z]+\.[a-z]+)`\. (Файл расположен в корне сервера\.|Каталог `([a-z]+)` расположен непосредственно в корне сервера\.)/u.exec(
            task.statement,
          );
        if (!match || (kind === 'url-root' ? Boolean(match[5]) : !match[5]))
          return false;
        protocol = match[1] ?? '';
        host = match[2] ?? '';
        path = `${match[5] ? `/${match[5]}` : ''}/${match[3] ?? ''}`;
      }
      const source = Array.from(task.answer.value)
        .map((letter) => rows.find((row) => row[1] === letter)?.[2] ?? '')
        .join('');
      try {
        const url = new URL(source);
        return (
          url.href === source &&
          url.protocol === `${protocol}:` &&
          url.host === host &&
          url.pathname === path &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    },
  };
}
export const urlRoot = address('url-root');
export const urlDirectory = address('url-directory');
export const urlSelect = address('url-select');
export const urlMove = address('url-move');
