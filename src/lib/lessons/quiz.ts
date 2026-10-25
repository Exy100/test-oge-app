import { checkAnswer } from '../../core/checker/index.ts';
import type { CorrectAnswer, FigureSpec } from '../../core/types.ts';

export interface ShortQuestion {
  kind: 'short';
  statementHtml: string;
  answer: Exclude<CorrectAnswer, { type: 'artifact' }>;
  mistakes: { answer: string; explanation: string }[];
  figure?: FigureSpec;
}
export interface ChoiceQuestion {
  kind: 'choice';
  prompt: string;
  options: { id: string; text: string }[];
  correctId: string;
  explanation: string;
}
export type LessonQuestion = ShortQuestion | ChoiceQuestion;

export function validateChoice(question: ChoiceQuestion): ChoiceQuestion {
  if (
    !question.prompt.trim() ||
    !question.explanation.trim() ||
    question.options.length < 2 ||
    question.options.some(
      (option) => !option.id.trim() || !option.text.trim(),
    ) ||
    new Set(question.options.map((option) => option.id)).size !==
      question.options.length ||
    !question.options.some((option) => option.id === question.correctId)
  )
    throw new TypeError(
      'Нужны вопрос, объяснение, разные варианты и один правильный вариант.',
    );
  return question;
}

export function checkLessonQuestion(question: LessonQuestion, raw: string) {
  if (question.kind === 'short')
    return checkAnswer(question.answer, raw, question.mistakes);
  validateChoice(question);
  if (!question.options.some((option) => option.id === raw))
    return {
      verdict: 'format_error' as const,
      message: 'Выбери один вариант ответа.',
    };
  return {
    verdict:
      raw === question.correctId
        ? ('correct' as const)
        : ('incorrect' as const),
    message: question.explanation,
  };
}
