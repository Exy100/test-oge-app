import type { CorrectAnswer, TaskInstance } from '../types';
import { normalizeAnswer } from './normalize';
import type { AnswerNotice, FormatReason } from './normalize';

export type AnswerCheck =
  | {
      verdict: 'format_error';
      counted: false;
      reason: FormatReason;
      message: string;
    }
  | {
      verdict: 'correct';
      counted: true;
      normalized: string;
      notices: AnswerNotice[];
    }
  | {
      verdict: 'incorrect';
      counted: true;
      normalized: string;
      notices: AnswerNotice[];
      explanation?: string;
    };

/** Expected answers and mistake lists come from validated task data. */
export function checkAnswer(
  expected: CorrectAnswer,
  raw: string,
  commonMistakes: readonly { answer: string; explanation: string }[] = [],
): AnswerCheck {
  if (expected.type === 'artifact')
    throw new TypeError(
      'Практическая работа проверяется по критериям, а не как краткий ответ.',
    );
  const reference = normalizeAnswer(expected, expected.value);
  if (!reference.ok)
    throw new TypeError('Эталон не соответствует формату ответа.');
  const actual = normalizeAnswer(expected, raw);
  if (!actual.ok)
    return {
      verdict: 'format_error',
      counted: false,
      reason: actual.reason,
      message: actual.message,
    };
  const details = {
    counted: true,
    normalized: actual.value,
    notices: actual.notices,
  } as const;
  if (actual.value === reference.value)
    return { verdict: 'correct', ...details };
  const mistake = commonMistakes.find((item) => {
    const candidate = normalizeAnswer(expected, item.answer);
    return candidate.ok && candidate.value === actual.value;
  });
  return {
    verdict: 'incorrect',
    ...details,
    ...(mistake ? { explanation: mistake.explanation } : {}),
  };
}

export function checkTaskAnswer(task: TaskInstance, raw: string): AnswerCheck {
  return checkAnswer(task.answer, raw, task.commonMistakes);
}
