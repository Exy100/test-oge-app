import { resolveStreamTask } from '../../core/stream/catalog.ts';
import { learningGenerators } from '../../core/generators/learning.ts';
import {
  referenceSchema,
  type StreamReference,
} from '../../core/stream/schemas.ts';
import { TaskInstanceSchema } from '../../core/schemas/index.ts';
import { renderRichText } from '../../core/rich-text/render.ts';
import { renderTaskGuidance } from '../task-guidance.ts';
import type { ShortQuestion } from './quiz.ts';

/** Resolve the seed on the server; authors never copy a calculated answer into MDX. */
export function lessonTask(input: StreamReference) {
  const source = referenceSchema.parse(input);
  const learning = learningGenerators.find(
    (entry) =>
      entry.id === source.generatorId && entry.taskNumber === source.taskNumber,
  );
  const generated = learning
    ? learning.generate(source.seed)
    : resolveStreamTask(source);
  if (learning && !learning.verify(generated))
    throw new Error('Учебный пример не прошёл проверку генератора.');
  const task = TaskInstanceSchema.parse(generated);
  return {
    task,
    statementHtml: renderRichText(task.statement),
    steps: task.solution.map((_, index) =>
      renderTaskGuidance(task, 'solution', index),
    ),
  };
}

export function shortQuestion(source: StreamReference): ShortQuestion {
  const { task, statementHtml } = lessonTask(source);
  if (task.answer.type === 'artifact')
    throw new TypeError(
      'Мини-тест проверяет понимание. Практическую работу нужно оценивать по критериям.',
    );
  return {
    kind: 'short',
    statementHtml,
    answer: task.answer,
    mistakes: task.commonMistakes,
    ...(task.figure ? { figure: task.figure } : {}),
  };
}
