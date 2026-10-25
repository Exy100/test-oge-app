/** The lesson's fixed-width model, deliberately independent of browser UTF encodings. */
export function textVolume(text: string, width: number) {
  if (![8, 16, 32].includes(width))
    throw new RangeError('Выбери 8, 16 или 32 бита на знак.');
  if (text.length > 160 || !/^[А-Яа-яЁёA-Za-z0-9 .,;:!?—\n-]*$/u.test(text))
    throw new RangeError(
      'До 160 знаков: русские и латинские буквы, цифры, пробелы, переносы и . , ; : ! ? — -',
    );
  const characters = Array.from(text).length;
  return {
    characters,
    bits: characters * width,
    bytes: (characters * width) / 8,
  };
}

export function removeListedWord(words: readonly string[], index: number) {
  if (
    words.length < 2 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= words.length
  )
    throw new RangeError('Выбери слово в списке из двух или более слов.');
  return words.filter((_, position) => position !== index).join(', ');
}

export function alphabetCapacity(size: number, width: number) {
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 64 ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 6
  )
    throw new RangeError(
      'Размер алфавита — от 2 до 64, длина кода — от 1 до 6 бит.',
    );
  let minimum = 1;
  while (2 ** minimum < size) minimum += 1;
  return { minimum, capacity: 2 ** width, fits: 2 ** width >= size };
}

export function byteGroups(bits: number) {
  if (!Number.isInteger(bits) || bits < 0 || bits > 1024)
    throw new RangeError('Введи целое число бит от 0 до 1024.');
  return { full: Math.floor(bits / 8), remainder: bits % 8 };
}
