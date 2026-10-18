import { quantity } from '../task.ts';
import type { DecodeProblem } from './short-problems.ts';

type Entry = readonly [letter: string, code: string];
type ThreeTexts = [string, string, string];

/** Explain actual choices in this signal, including continuations that fail. */
export function decodeGuidance(
  problem: DecodeProblem,
  message: string,
  answer: string,
): { steps: ThreeTexts; hints: ThreeTexts } {
  const entries = Object.entries(problem.codes);
  const matching = (offset: number): Entry[] =>
    entries.filter(([, code]) => problem.encoded.startsWith(code, offset));
  const label = ([letter, code]: Entry): string => `«${letter}» — \`${code}\``;
  let offset = 0;
  const parts = Array.from(message, (letter) => {
    const code = problem.codes[letter] ?? '';
    const part = { letter, code, offset, choices: matching(offset) };
    offset += code.length;
    return part;
  });
  const first = parts[0];
  if (!first || offset !== problem.encoded.length)
    throw new Error('Для разбора нужна полная расшифровка сообщения.');
  const fork = parts.find((part) => part.choices.length > 1);
  const overlap = entries.find(([, code]) =>
    entries.some(([, other]) => other !== code && other.startsWith(code)),
  );
  const longer = overlap
    ? entries.find(
        ([, code]) => code !== overlap[1] && code.startsWith(overlap[1]),
      )
    : undefined;
  const width = first.code.length;
  const fixed = entries.every(([, code]) => code.length === width);

  // Merge paths at the same position: their remaining possibilities are identical.
  // Every reachable dead end is described; a viable alternative is never rejected.
  function rejectedChoice(position: number, entry: Entry): string | undefined {
    const paths = new Map<number, string[]>([[position + entry[1].length, []]]);
    const deadEnds: string[] = [];
    for (
      let index = position + entry[1].length;
      index <= problem.encoded.length;
      index++
    ) {
      const path = paths.get(index);
      if (!path) continue;
      if (index === problem.encoded.length) return undefined;
      const choices = matching(index);
      if (choices.length === 0) {
        deadEnds.push(
          `${path.length ? `После ${path.map((code) => `\`${code}\``).join(' / ')} остаётся` : 'Остаётся'} \`${problem.encoded.slice(index)}\` (с позиции ${String(index + 1)}). К началу этого остатка не подходит ни один код из таблицы.`,
        );
      }
      for (const [, code] of choices)
        if (!paths.has(index + code.length))
          paths.set(index + code.length, [...path, code]);
    }
    return `Если выбрать букву «${entry[0]}» (код \`${entry[1]}\`):\n\n${deadEnds.join('\n\n')}\n\nС таким выбором прочитать сообщение целиком не получится.`;
  }

  const rule = fixed
    ? `Все коды в таблице состоят из ${quantity(width, ['знака', 'знаков', 'знаков'])}. Поэтому делим запись на группы по ${quantity(width, ['знаку', 'знака', 'знаков'])}, начиная с первого знака.`
    : overlap && longer
      ? `В таблице ${label(overlap)}, а ${label(longer)}. Короткий код совпадает с началом длинного. Поэтому при выборе буквы нужно проверить, удаётся ли разобрать оставшуюся часть сообщения.`
      : `Ни один код в таблице не совпадает с началом другого. Читаем слева направо: как только набран код из таблицы, записываем букву и начинаем читать следующую.`;
  const rejected = fork
    ? fork.choices
        .filter(([letter]) => letter !== fork.letter)
        .map((entry) => rejectedChoice(fork.offset, entry))
        .filter((text): text is string => text !== undefined)
    : [];
  const choice = fork
    ? `С позиции ${String(fork.offset + 1)} записано \`${problem.encoded.slice(fork.offset)}\`. К началу этой строки подходят ${fork.choices.map(label).join('; ')}.\n\n${rejected.join('\n\n')}\n\nБерём код \`${fork.code}\` — это буква «${fork.letter}». Ниже проверим разбиение всего сообщения.`
    : `Начало записи — \`${first.code}\` (${quantity(width, ['знак', 'знака', 'знаков'])}). По таблице это буква «${first.letter}». Продолжаем с позиции ${String(width + 1)}.`;
  const rows = parts.map(
    (part, index) =>
      `| ${String(index + 1)} | \`${part.code}\` | ${part.letter} |`,
  );
  const counts = [...new Set(message)].map((letter) => ({
    letter,
    count: Array.from(message).filter((item) => item === letter).length,
  }));
  const counted = counts[0];
  if (!counted) throw new Error('Сообщение не содержит букв.');
  const second = parts[1];
  return {
    hints: [
      fixed
        ? `Посмотри на длину кодов: у каждой буквы по ${quantity(width, ['знаку', 'знака', 'знаков'])}. Отсчитывай столько же знаков от начала записи — так получатся границы букв.`
        : overlap && longer
          ? `Сравни: ${label(overlap)}; ${label(longer)}. По одному совпадению с коротким кодом ещё нельзя выбрать букву: нужно проверить, можно ли прочитать остаток.`
          : `Начни с \`${first.code}\`: это код первой буквы. Найди её в таблице. Здесь ни один код не является началом другого, поэтому границу буквы можно отметить сразу.`,
      fork
        ? `Рассмотри запись с позиции ${String(fork.offset + 1)}: \`${problem.encoded.slice(fork.offset)}\`. Здесь подходят ${fork.choices.map(label).join('; ')}. Убери по очереди каждый из этих кодов и попробуй прочитать оставшиеся знаки.`
        : `Первая группа — \`${first.code}\`${second ? `, следующая — \`${second.code}\`` : ''}. Найди соответствующие буквы в таблице и продолжай делить запись тем же способом.`,
      problem.repeatedOnly
        ? `После расшифровки посчитай каждую букву. Например, «${counted.letter}» встречается ${quantity(counted.count, ['раз', 'раза', 'раз'])}. В ответ включи буквы, которые встретились хотя бы дважды; каждую запиши один раз.`
        : fork
          ? `${rejected[0] ?? 'Проверь каждый вариант разбиения до конца записи.'}\n\nВ этом месте подходит код \`${fork.code}\` буквы «${fork.letter}». Продолжи читать после него.`
          : `Первая буква — «${first.letter}» (\`${first.code}\`). Когда расшифруешь остальные, замени каждую букву её кодом: должна получиться исходная запись \`${problem.encoded}\`.`,
    ],
    steps: [
      `${rule}\n\n${choice}`,
      `Разделим всю запись на коды букв:\n\n\`${parts.map((part) => part.code).join(' / ')}\`\n\n| № буквы | Код | Буква |\n| --- | --- | --- |\n${rows.join('\n')}\n\nЧитаем буквы сверху вниз: **${message}**.`,
      problem.repeatedOnly
        ? `Подсчитаем буквы в сообщении ${message}: ${counts.map(({ letter, count }) => `«${letter}» — ${quantity(count, ['раз', 'раза', 'раз'])}`).join('; ')}.\n\nХотя бы дважды встретились ${counts
            .filter(({ count }) => count >= 2)
            .map(({ letter }) => `«${letter}»`)
            .join(
              ', ',
            )}. Каждую записываем один раз. Ответ: **${answer}**. Порядок этих букв может быть любым.`
        : `Проверим обратным кодированием: ${parts.map((part) => `«${part.letter}» → \`${part.code}\``).join('; ')}.\n\nСоединив коды без разделителей, получим \`${problem.encoded}\` — исходную запись. Значит, все знаки использованы. Ответ: **${answer}**.`,
    ],
  };
}
