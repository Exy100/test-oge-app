export type CodeEntry = { letter: string; code: string };
export const decoderPresets = {
  prefix: {
    title: 'Префиксная таблица',
    codes: ['0', '10', '110', '111'],
    signal: '010110',
  },
  nonprefix: {
    title: 'Непрефиксная: единственный разбор',
    codes: ['0', '01', '11', '101'],
    signal: '011',
  },
  ambiguous: {
    title: 'Непрефиксная: два разбора',
    codes: ['0', '01', '10', '11'],
    signal: '010',
  },
  signals: {
    title: 'Непрефиксные сигналы: точки и тире',
    codes: ['.', '.-', '--', '-.-'],
    signal: '.--',
  },
} as const;
export type DecoderPreset = keyof typeof decoderPresets;

export function analyzeSignal(entries: readonly CodeEntry[], signal: string) {
  if (
    entries.length < 2 ||
    entries.length > 6 ||
    entries.some(
      ({ letter, code }) =>
        !/^[А-ЯЁ]$/u.test(letter) || !/^[01.o~#+-]{1,5}$/u.test(code),
    ) ||
    new Set(entries.map((entry) => entry.letter)).size !== entries.length ||
    new Set(entries.map((entry) => entry.code)).size !== entries.length
  )
    throw new RangeError(
      'Буквы и коды не должны повторяться; каждый код — от 1 до 5 знаков из 0 1 . - o ~ # +.',
    );
  if (!/^[01.o~#+-]{1,64}$/u.test(signal))
    throw new RangeError(
      'Введи от 1 до 64 знаков из 0 1 . - o ~ # + без пробелов.',
    );
  // Count suffixes before listing paths. Even ambiguous inputs have bounded work.
  const counts = Array<bigint>(signal.length + 1).fill(0n);
  counts[signal.length] = 1n;
  for (let offset = signal.length - 1; offset >= 0; offset--)
    for (const { code } of entries)
      if (signal.startsWith(code, offset))
        counts[offset] =
          (counts[offset] ?? 0n) + (counts[offset + code.length] ?? 0n);
  const messages: string[] = [];
  function visit(offset: number, text: string) {
    if (messages.length >= 20) return;
    if (offset === signal.length) {
      messages.push(text);
      return;
    }
    for (const { letter, code } of entries)
      if (
        signal.startsWith(code, offset) &&
        (counts[offset + code.length] ?? 0n) > 0n
      )
        visit(offset + code.length, text + letter);
  }
  visit(0, '');
  return {
    count: counts[0] ?? 0n,
    messages,
    prefixFree: !entries.some((a) =>
      entries.some((b) => a !== b && b.code.startsWith(a.code)),
    ),
  };
}

export function encodeMessage(entries: readonly CodeEntry[], message: string) {
  return Array.from(message)
    .map((letter) => {
      const entry = entries.find((item) => item.letter === letter);
      if (!entry) throw new RangeError('Буквы нет в таблице.');
      return entry.code;
    })
    .join('');
}
