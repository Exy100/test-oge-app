export interface CodeEntry {
  letter: string;
  code: string;
}

export function codeTable(entries: readonly CodeEntry[]): string {
  return [
    '| Буква | Код |',
    '| --- | --- |',
    ...entries.map(({ letter, code }) => `| ${letter} | ${code} |`),
  ].join('\n');
}

export function readCodes(
  statement: string,
  alphabet: RegExp,
): CodeEntry[] | null {
  const entries = [
    ...statement.matchAll(/^\| ([А-ЯЁ]) \| ([^ |]+) \|$/gmu),
  ].map((match) => ({ letter: match[1] ?? '', code: match[2] ?? '' }));
  if (
    entries.length < 4 ||
    entries.length > 8 ||
    new Set(entries.map((item) => item.letter)).size !== entries.length ||
    new Set(entries.map((item) => item.code)).size !== entries.length ||
    entries.some((item) => !alphabet.test(item.code))
  )
    return null;
  return entries;
}

/** All segmentations, capped at two witnesses: enough to reject ambiguity. */
export function decodings(
  signal: string,
  entries: readonly CodeEntry[],
): string[] {
  if (signal.length > 64 || !signal || entries.some((item) => !item.code))
    return [];
  const suffixes: string[][] = Array.from(
    { length: signal.length + 1 },
    () => [],
  );
  suffixes[signal.length] = [''];
  for (let offset = signal.length - 1; offset >= 0; offset -= 1) {
    const candidates = new Set<string>();
    for (const { letter, code } of entries) {
      if (!signal.startsWith(code, offset)) continue;
      for (const suffix of suffixes[offset + code.length] ?? []) {
        candidates.add(letter + suffix);
        if (candidates.size === 2) break;
      }
      if (candidates.size === 2) break;
    }
    suffixes[offset] = [...candidates];
  }
  return suffixes[0] ?? [];
}

export function encode(
  text: string,
  entries: readonly CodeEntry[],
): string | null {
  const codes = new Map(entries.map((item) => [item.letter, item.code]));
  let result = '';
  for (const letter of text) {
    const code = codes.get(letter);
    if (code === undefined) return null;
    result += code;
  }
  return result;
}
