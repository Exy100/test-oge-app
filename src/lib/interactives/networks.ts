import {
  urlOrders,
  type UrlProblem,
} from '../../core/generators/exam/short-problems';
export const addressLabs = {
  https: {
    title: 'HTTPS: текстовый файл',
    problem: {
      kind: 'url',
      target: 'https://atlas.ru/map.txt',
      fragments: ['.txt', 'atlas.', '/', 'https', 'map', '://', 'ru'],
    },
  },
  ftp: {
    title: 'FTP: изображение',
    problem: {
      kind: 'url',
      target: 'ftp://school.org/photo.jpg',
      fragments: ['photo', 'org', 'ftp', '/', '.jpg', 'school.', '://'],
    },
  },
  overlap: {
    title: 'HTTP: несколько правильных сборок',
    problem: {
      kind: 'url',
      target: 'http://atlas.ru/aaa.txt',
      fragments: ['http://', 'atlas', '.ru', '/', 'a', 'aa', '.txt'],
    },
  },
} as const satisfies Record<string, { title: string; problem: UrlProblem }>;

/** A partial construction is useful feedback, but only all seven pieces can pass. */
export function assembleAddress(problem: UrlProblem, sequence: string) {
  if (
    !/^[1-7]{0,7}$/u.test(sequence) ||
    new Set(sequence).size !== sequence.length
  )
    throw new RangeError(
      'Используй метки 1–7 без пробелов, каждую не более одного раза.',
    );
  if (!urlOrders(problem).length)
    throw new RangeError('Фрагменты не составляют заданный адрес.');
  const address = Array.from(
    sequence,
    (digit) => problem.fragments[Number(digit) - 1] ?? '',
  ).join('');
  return {
    address,
    complete: sequence.length === 7,
    correct: sequence.length === 7 && address === problem.target,
  };
}
export function addressParts(target: string) {
  const url = new URL(target);
  if (
    !['http:', 'https:', 'ftp:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new RangeError(
      'В этом опыте используется HTTP, HTTPS или FTP без параметров и учётных данных.',
    );
  return {
    scheme: url.protocol.slice(0, -1),
    host: url.host,
    path: url.pathname,
  };
}
