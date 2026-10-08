import type { CorrectAnswer } from '../types';

export type ShortAnswer = Exclude<CorrectAnswer, { type: 'artifact' }>;
export type FormatReason = 'empty' | 'integer' | 'alphabet' | 'text';
export interface AnswerNotice {
  code: 'sequence_spacing';
  message: string;
}
export type NormalizedAnswer =
  | { ok: true; value: string; notices: AnswerNotice[] }
  | { ok: false; reason: FormatReason; message: string };

const alphabets = {
  digits: /^[0-9]+$/u,
  latin: /^[A-Za-z]+$/u,
  cyrillic: /^[А-Яа-яЁё]+$/u,
};

/** trim follows ECMAScript whitespace; internal characters are format-specific. */
export function normalizeAnswer(
  format: ShortAnswer,
  raw: string,
): NormalizedAnswer {
  const trimmed = raw.trim();
  if (trimmed.length === 0)
    return { ok: false, reason: 'empty', message: 'Введи ответ.' };
  if (format.type === 'integer') {
    if (!/^[+-]?[0-9]+$/u.test(trimmed))
      return {
        ok: false,
        reason: 'integer',
        message:
          'Введи целое число без дробной части, пробелов внутри и единиц измерения.',
      };
    return { ok: true, value: BigInt(trimmed).toString(), notices: [] };
  }
  if (format.type === 'word') {
    if (/\p{Cc}|\p{Cf}/u.test(trimmed))
      return {
        ok: false,
        reason: 'text',
        message: 'Убери управляющие и невидимые служебные символы.',
      };
    const nfc = trimmed.normalize('NFC');
    return {
      ok: true,
      value: format.caseSensitive ? nfc : nfc.toLowerCase().normalize('NFC'),
      notices: [],
    };
  }
  const compact = trimmed.replace(/[ \u00a0]/gu, '');
  const nfc = compact.normalize('NFC');
  if (!alphabets[format.alphabet].test(nfc))
    return {
      ok: false,
      reason: 'alphabet',
      message:
        'Проверь алфавит: используй только символы, указанные в задании, без запятых и других разделителей.',
    };
  return {
    ok: true,
    value: format.caseSensitive ? nfc : nfc.toLowerCase(),
    notices:
      compact === trimmed
        ? []
        : [
            {
              code: 'sequence_spacing',
              message:
                'Пробелы между символами не учитывались. На бланке запиши последовательность подряд, без пробелов.',
            },
          ],
  };
}
