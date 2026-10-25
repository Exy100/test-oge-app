/** Original CC0 training texts; the ZIP endpoint encodes these exact strings as UTF-8. */
export const trainingFiles = [
  {
    path: 'Тексты/Нина/причал.txt',
    text: 'Автор: Нина. Герой: Мирон.\n\nНа причале Мирон встретил лодочника Орлова. Рядом сидел щенок Буран.\n\nПосле дождя Мирон починил компас. Орлов сказал: «Это полезный труд».\n\nВечером они вернулись к лодке.\n',
  },
  {
    path: 'Тексты/Нина/путь.txt',
    text: 'Автор: Нина. Герой: Лев.\n\nЛев встретил учителя Серова. Рядом сидел щенок Дымок.\n\nНаутро Лев починил компас. Серов сказал: «Это полезный труд».\n',
  },
  {
    path: 'Тексты/Нина/Черновики/причал.txt',
    text: 'Черновик наблюдений.\n\nНа горизонте виден маяк. Маяки помогают морякам.\n\nМаяк освещён вечером.\n',
  },
  {
    path: 'Тексты/Олег/причал.txt',
    text: 'Автор: Олег. Герой: Мирон.\n\nМирон встретил картографа Волкова и щенка Тумана.\n\nПосле дождя Мирон починил компас. Волков сказал: «Это полезный труд».\n',
  },
  {
    path: 'Тексты-архив/Нина/причал.txt',
    text: 'Архив: другой рассказ. Мирон встретил фотографа Зайцева.\n\nЗайцев сказал: «Это полезный труд».\n',
  },
  { path: 'Данные/note_a.txt', text: 'Маяк.\n' },
  { path: 'Данные/note_ab.txt', text: 'Маяки.\n' },
  { path: 'Данные/old/note_b.txt', text: 'Старый маяк.\n' },
  { path: 'Данные/note_a.csv', text: 'место,уровень\nпричал,125\n' },
] as const;
export type TrainingFile = (typeof trainingFiles)[number];
export const folders = [
  '',
  ...new Set(
    trainingFiles.flatMap(({ path }) => {
      const parts = path.split('/');
      return parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  ),
];
export function inFolder(path: string, folder: string, recursive: boolean) {
  const prefix = folder ? folder + '/' : '';
  if (!path.startsWith(prefix)) return false;
  return recursive || !path.slice(prefix.length).includes('/');
}
export function maskMatches(name: string, mask: string) {
  if (!mask || mask.length > 80 || /[/\\]/u.test(mask))
    throw new RangeError(
      'Маска имени: от 1 до 80 знаков, без пути. * — любое число знаков, ? — один.',
    );
  // Bounded dynamic programming, not an executable expression or unbounded regex.
  const characters = Array.from(name.toLocaleLowerCase('ru'));
  let previous = Array.from(
    { length: characters.length + 1 },
    (_, i) => i === 0,
  );
  for (const token of Array.from(mask.toLocaleLowerCase('ru'))) {
    const next = Array.from({ length: characters.length + 1 }, () => false);
    next[0] = token === '*' && Boolean(previous[0]);
    for (let i = 1; i <= characters.length; i++)
      next[i] =
        token === '*'
          ? Boolean(previous[i] || next[i - 1])
          : Boolean(
              previous[i - 1] && (token === '?' || token === characters[i - 1]),
            );
    previous = next;
  }
  return Boolean(previous[characters.length]);
}
export function selectTrainingFiles(
  folder: string,
  recursive: boolean,
  mask: string,
) {
  if (!folders.includes(folder)) throw new RangeError('Неизвестный каталог.');
  maskMatches('', mask);
  const files = trainingFiles.filter(
    ({ path }) =>
      inFolder(path, folder, recursive) &&
      maskMatches(path.split('/').at(-1) ?? '', mask),
  );
  return {
    files,
    bytes: files.reduce(
      (sum, file) => sum + new TextEncoder().encode(file.text).byteLength,
      0,
    ),
  };
}
export function searchTrainingFiles(
  folder: string,
  query: string,
  wholeWord: boolean,
) {
  if (!folders.includes(folder)) throw new RangeError('Неизвестный каталог.');
  if (!query.trim() || query.length > 80)
    throw new RangeError('Введи от 1 до 80 знаков для поиска.');
  const needle = query.trim().toLocaleLowerCase('ru');
  const word = /[\p{L}\p{N}\p{M}_]/u;
  return trainingFiles
    .filter(({ path }) => inFolder(path, folder, true))
    .flatMap((file) => {
      const text = file.text.toLocaleLowerCase('ru');
      const positions: number[] = [];
      let start = 0,
        index = text.indexOf(needle, start);
      while (index >= 0) {
        if (
          !wholeWord ||
          (!word.test(text[index - 1] ?? '') &&
            !word.test(text[index + needle.length] ?? ''))
        )
          positions.push(index);
        start = index + needle.length;
        index = text.indexOf(needle, start);
      }
      return positions.length
        ? [{ file, positions, length: needle.length }]
        : [];
    });
}
