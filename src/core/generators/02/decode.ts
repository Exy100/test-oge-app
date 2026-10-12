import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';
import { codeTable, decodings, readCodes } from './codes.ts';

type Mode = 'fixed-code' | 'prefix-code' | 'separated-code';
const titles = {
  'fixed-code': 'Расшифровка равномерного двоичного кода',
  'prefix-code': 'Расшифровка неравномерного префиксного кода',
  'separated-code': 'Расшифровка сигнала с разделителями',
};

function decoder(mode: Mode): Generator {
  return {
    id: `${mode}-v1`,
    taskNumber: 2,
    subtype: mode,
    title: titles[mode],
    generate(seed) {
      const rng = new Rng(seed);
      const separated = mode === 'separated-code';
      const fixed = mode === 'fixed-code';
      const codes = fixed
        ? ['000', '001', '010', '011', '100', '101']
        : separated
          ? ['.', '-', '..', '.-', '-.', '--']
          : ['0', '10', '110', '1110', '1111'];
      const letters = Array.from(fixed || separated ? 'АБВГДЕ' : 'АКМОР');
      const shuffled = rng.shuffle(codes);
      const entries = letters.map((letter, index) => ({
        letter,
        code: shuffled[index] ?? '',
      }));
      const text =
        fixed || separated
          ? rng.shuffle(letters).slice(0, rng.int(4, 6)).join('')
          : rng.pick([
              'КОМАР',
              'МАРКА',
              'РАМКА',
              'КОРА',
              'МРАМОР',
              'КОРМА',
              'АРКА',
            ]);
      const chunks = Array.from(text).map(
        (letter) => entries.find((item) => item.letter === letter)?.code ?? '',
      );
      const signal = chunks.join(separated ? '/' : '');
      const rules = fixed
        ? 'Каждая буква кодируется тремя битами. Коды записаны слева направо без разделителей.'
        : separated
          ? 'Коды состоят из точек и дефисов. Знак / разделяет соседние буквы и не входит в код буквы. Читай слева направо.'
          : 'Коды имеют разную длину. Ни один код не является началом другого. Коды записаны слева направо без разделителей.';
      const firstStep = fixed
        ? `Раздели сигнал на группы по три бита: ${chunks.join(' | ')}.`
        : separated
          ? `Раздели сигнал только по знакам /: ${chunks.join(' | ')}. Точки и дефисы внутри группы не разделяй.`
          : `Читай слева направо, завершая букву при совпадении с кодом из таблицы: ${chunks.join(' | ')}.`;
      return taskFrom(mode, 2, seed, {
        statement: `${rules}\n\n${codeTable(entries)}\n\nПередано: \`${signal}\`. Расшифруй сообщение. Ответ запиши последовательностью заглавных кириллических букв из таблицы, без пробелов; регистр учитывается.`,
        answer: {
          type: 'sequence',
          value: text,
          alphabet: 'cyrillic',
          caseSensitive: true,
        },
        solution: [
          { text: firstStep },
          {
            text: `Подставь буквы по таблице: ${chunks.map((code, index) => `${code} → ${text[index] ?? ''}`).join('; ')}.`,
          },
          {
            text: `Соедини буквы в исходном порядке: ${text}. Обратное кодирование даёт ${signal}.`,
          },
        ],
        hints: [
          fixed
            ? 'Определи длину кода одной буквы.'
            : separated
              ? 'Найди разделители букв.'
              : 'Начни с левого края сигнала.',
          fixed
            ? 'Дели на группы по три бита, сохраняя ведущие нули.'
            : separated
              ? 'Одна группа между знаками / — одна буква.'
              : 'Накапливай биты до совпадения с кодом из таблицы.',
          'Замени коды буквами и сохрани порядок всех букв.',
        ],
        commonMistakes: [
          {
            answer: Array.from(text).reverse().join(''),
            explanation:
              'Порядок букв перевёрнут. Сообщение читается слева направо.',
          },
          {
            answer: text.slice(1),
            explanation:
              'Пропущена первая кодовая группа. Используй весь сигнал, включая его начало.',
          },
        ],
      });
    },
    verify(task) {
      const separated = mode === 'separated-code';
      const entries = readCodes(
        task.statement,
        separated ? /^[.-]{1,2}$/u : /^[01]{1,4}$/u,
      );
      const signal = /Передано: `([^`]+)`/u.exec(task.statement)?.[1];
      if (
        !entries ||
        !signal ||
        signal.length > 64 ||
        task.answer.type !== 'sequence'
      )
        return false;
      if (
        mode === 'fixed-code' &&
        entries.some((item) => item.code.length !== 3)
      )
        return false;
      if (
        mode === 'prefix-code' &&
        entries.some((a) =>
          entries.some((b) => a !== b && b.code.startsWith(a.code)),
        )
      )
        return false;
      if (separated) {
        const groups = signal.split('/');
        if (
          groups.some((group) => !entries.some((item) => item.code === group))
        )
          return false;
        const decoded = groups
          .map((group) => entries.find((item) => item.code === group)?.letter)
          .join('');
        return decoded === task.answer.value;
      }
      const results = decodings(signal, entries);
      return results.length === 1 && results[0] === task.answer.value;
    },
  };
}

export const fixedCode = decoder('fixed-code');
export const prefixCode = decoder('prefix-code');
export const separatedCode = decoder('separated-code');
