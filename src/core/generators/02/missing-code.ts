import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';
import { codeTable, encode, readCodes } from './codes.ts';

export const missingCode: Generator = {
  id: 'missing-code-v1',
  taskNumber: 2,
  subtype: 'missing-code',
  title: 'Восстановление пропущенного кода',
  generate(seed) {
    const rng = new Rng(seed);
    const letters = rng.shuffle(Array.from('АКМОР'));
    const codes = rng.shuffle(['00', '01', '10', '110', '111']);
    const entries = letters.map((letter, index) => ({
      letter,
      code: codes[index] ?? '',
    }));
    const hidden = entries[0];
    if (!hidden) throw new Error('Пустой алфавит.');
    const text = [
      letters[1],
      hidden.letter,
      letters[2],
      hidden.letter,
      letters[3],
    ].join('');
    const signal = encode(text, entries) ?? '';
    const known = entries.filter((item) => item !== hidden);
    const knownLength = (
      encode([letters[1], letters[2], letters[3]].join(''), known) ?? ''
    ).length;
    const table = entries.map((item) =>
      item === hidden ? { ...item, code: '?' } : item,
    );
    return taskFrom('missing-code', 2, seed, {
      statement: `Каждой букве соответствует непустой двоичный код длиной не более четырёх бит. Коды записываются слева направо без разделителей. Один код в таблице скрыт знаком ?.\n\n${codeTable(table)}\n\nСообщение: «${text}». Передано: \`${signal}\`. Восстанови код буквы ${hidden.letter}. Ответ запиши строкой из 0 и 1 без пробелов; ведущие нули обязательны.`,
      answer: {
        type: 'sequence',
        value: hidden.code,
        alphabet: 'digits',
        caseSensitive: true,
      },
      solution: [
        {
          text: `Буква ${hidden.letter} встречается дважды. Известные коды занимают ${String(knownLength)} бит из ${String(signal.length)}.`,
        },
        {
          text: `Оставшееся число бит для двух одинаковых групп: ${String(signal.length - knownLength)}. Длина искомого кода: (${String(signal.length)} − ${String(knownLength)}) ÷ 2 = ${String(hidden.code.length)}.`,
        },
        {
          text: `Выдели группы по порядку букв: ${Array.from(text)
            .map((letter) => encode(letter, entries))
            .join(
              ' | ',
            )}. В обоих местах букве ${hidden.letter} соответствует ${hidden.code}. Ответ: ${hidden.code}.`,
        },
      ],
      hints: [
        'Посчитай все вхождения буквы со скрытым кодом.',
        'Вычти длины известных кодов из длины сигнала и раздели остаток на число вхождений.',
        'Выдели неизвестные группы и проверь, что они совпали. Не удаляй ведущие нули.',
      ],
      commonMistakes: [
        {
          answer: hidden.code + hidden.code,
          explanation: 'Это два вхождения кода. Нужен код одной буквы.',
        },
        {
          answer: hidden.code.slice(1),
          explanation:
            'Потерян первый бит. В кодовой последовательности каждый бит значим, в том числе ведущий ноль.',
        },
      ],
    });
  },
  verify(task) {
    const entries = readCodes(task.statement, /^(?:[01]{1,4}|\?)$/u);
    const text = /Сообщение: «([А-ЯЁ]+)»/u.exec(task.statement)?.[1];
    const signal = /Передано: `([01]+)`/u.exec(task.statement)?.[1];
    const hidden = entries?.filter((item) => item.code === '?');
    const requested = /Восстанови код буквы ([А-ЯЁ])\./u.exec(
      task.statement,
    )?.[1];
    if (
      !entries ||
      !text ||
      text.length > 16 ||
      !signal ||
      signal.length > 64 ||
      hidden?.length !== 1 ||
      hidden[0]?.letter !== requested ||
      task.answer.type !== 'sequence'
    )
      return false;
    const possible: string[] = [];
    for (let length = 1; length <= 4; length += 1) {
      for (let number = 0; number < 2 ** length; number += 1) {
        const code = number.toString(2).padStart(length, '0');
        const candidate = entries.map((item) =>
          item.code === '?' ? { ...item, code } : item,
        );
        if (encode(text, candidate) === signal) possible.push(code);
      }
    }
    return possible.length === 1 && possible[0] === task.answer.value;
  },
};
