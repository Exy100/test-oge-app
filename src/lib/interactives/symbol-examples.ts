export type SymbolScenario =
  'sentence-delete' | 'sentence-repeat' | 'list-repeat';
export type SymbolEncoding = 'Unicode' | 'Windows-1251' | 'КОИ-8';
export interface SymbolExample {
  text: string;
  word: string;
  bits: 8 | 16;
  encoding: SymbolEncoding;
  delta: number;
}
const snow =
  'Скользя по утреннему снегу, Друг милый, предадимся бегу Нетерпеливого коня И навестим поля пустые…';
const uncle = 'Мой дядя самых честных правил, Когда не в шутку занемог…';
const thought = 'Вздыхать и думать про себя: Когда же чёрт возьмёт тебя!';
const physicists = 'Ом, Бор, Кюри, Попов, Джоуль, Рентген, Курчатов, Резерфорд';
/** Curated from the supplied collection; deltas are checked independently in tests.
 * Incorrect supplied answers are corrected: 36 → Попов, 4A455C → Джоуль,
 * 30E9EC → Курчатов, 321E93 → Ом, BBFB3E → про.
 */
export const symbolExamples: Record<SymbolScenario, readonly SymbolExample[]> =
  {
    'sentence-delete': [
      {
        text: uncle,
        word: 'дядя',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 5,
      },
      {
        text: thought,
        word: 'думать',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 7,
      },
      { text: uncle, word: 'не', bits: 16, encoding: 'Unicode', delta: 6 },
      { text: thought, word: 'же', bits: 16, encoding: 'Unicode', delta: 6 },
      {
        text: thought,
        word: 'про',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 4,
      },
    ],
    'sentence-repeat': [
      { text: snow, word: 'пустые', bits: 16, encoding: 'Unicode', delta: 14 },
      {
        text: snow,
        word: 'Скользя',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 8,
      },
      {
        text: snow,
        word: 'навестим',
        bits: 16,
        encoding: 'Unicode',
        delta: 18,
      },
      {
        text: snow,
        word: 'Нетерпеливого',
        bits: 8,
        encoding: 'КОИ-8',
        delta: 14,
      },
    ],
    'list-repeat': [
      {
        text: physicists,
        word: 'Попов',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 7,
      },
      {
        text: physicists,
        word: 'Джоуль',
        bits: 8,
        encoding: 'Windows-1251',
        delta: 8,
      },
      {
        text: physicists,
        word: 'Курчатов',
        bits: 16,
        encoding: 'Unicode',
        delta: 20,
      },
      { text: physicists, word: 'Ом', bits: 16, encoding: 'Unicode', delta: 8 },
      {
        text: physicists,
        word: 'Рентген',
        bits: 8,
        encoding: 'КОИ-8',
        delta: 9,
      },
      {
        text: 'Шрек, Винни-Пух, Пиноккио',
        word: 'Винни-Пух',
        bits: 8,
        encoding: 'КОИ-8',
        delta: 11,
      },
    ],
  };
export const symbolScenarios = {
  'sentence-delete': {
    title: 'Удаление из предложения',
    repeat: false,
    comma: false,
  },
  'sentence-repeat': {
    title: 'Повтор в предложении',
    repeat: true,
    comma: false,
  },
  'list-repeat': { title: 'Повтор в списке', repeat: true, comma: true },
} as const;
export function symbolExample(
  scenario: SymbolScenario,
  index: number,
): SymbolExample {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('Неверный номер примера.');
  const example =
    symbolExamples[scenario][index % symbolExamples[scenario].length];
  if (!example) throw new RangeError('Пример не найден.');
  return example;
}
export function symbolWords(text: string) {
  return Array.from(
    text.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/gu),
    (match) => ({ word: match[0], start: match.index }),
  );
}
/** Keep punctuation intact; repeated material is inserted BEFORE the original word. */
export function editSymbolExample(
  example: SymbolExample,
  scenario: SymbolScenario,
  start: number,
) {
  const token = symbolWords(example.text).find((word) => word.start === start);
  if (!token) throw new RangeError('Выбери слово в исходном тексте.');
  const rule = symbolScenarios[scenario];
  const separator = rule.comma ? ', ' : ' ';
  let from = start;
  let to = start + token.word.length;
  let fragment = token.word + separator;
  let after: string;
  if (rule.repeat)
    after = example.text.slice(0, start) + fragment + example.text.slice(start);
  else {
    if (example.text[start - 1] === ' ') from--;
    else if (example.text[to] === ' ') to++;
    else throw new RangeError('Рядом со словом нет пробела для удаления.');
    fragment = example.text.slice(from, to);
    after = example.text.slice(0, from) + example.text.slice(to);
  }
  const symbols = Array.from(fragment).length;
  return {
    before: example.text,
    after,
    fragment,
    from,
    to,
    symbols,
    delta: (symbols * example.bits) / 8,
    word: token.word,
  };
}
