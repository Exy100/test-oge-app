import { buildFixedVariant, variantSeed } from '../../src/core/variants';
import {
  createExamDraft,
  type ExamAttempt,
} from '../../src/core/variants/exam';

export function printedAttempt(
  choice: 'document' | 'presentation',
  complete: boolean,
): ExamAttempt {
  const variant = buildFixedVariant('V01', choice);
  const draft = createExamDraft(
    {
      id: `print-${choice}`,
      variantId: variant.id,
      seed: variantSeed(variant),
      variant13: choice,
    },
    Date.parse('2026-10-27T03:00:00Z'),
  );
  const answers: ExamAttempt['answers'] = [];
  const assessments: ExamAttempt['assessments'] = [];
  for (const task of variant.tasks) {
    answers.push({
      taskNumber: task.taskNumber,
      text:
        task.answer.type !== 'artifact'
          ? task.answer.value
          : task.taskNumber === 16
            ? `n = int(input())\nprint(n)\n# ${'длинная запись '.repeat(30)}конец-длинной-строки`
            : `работа-${String(task.taskNumber)}.${task.taskNumber === 13 ? (choice === 'document' ? 'odt' : 'odp') : 'txt'}`,
      reasoning: `Моя запись для печати №${String(task.taskNumber)}: <текст сохранён буквально>.`,
    });
    if (complete && task.criteria && task.taskNumber >= 13) {
      if (
        task.taskNumber !== 13 &&
        task.taskNumber !== 14 &&
        task.taskNumber !== 15 &&
        task.taskNumber !== 16
      )
        throw new Error('Неизвестный практический номер.');
      assessments.push({
        taskNumber: task.taskNumber,
        score: task.criteria.max,
        source: 'self',
      });
    }
  }
  return {
    ...draft,
    answers,
    assessments,
    elapsedMs: 1000,
    finishedAt: '2026-10-27T03:00:01Z',
    score: null,
  };
}
