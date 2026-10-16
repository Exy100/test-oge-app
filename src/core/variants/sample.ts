import { examConfig } from '../exam/exam.config.ts';
import type { TaskInstance, Variant } from '../types.ts';
import { reviewAnswer, reviewFigure } from '../generators/review.ts';
import {
  selectedVariant13,
  variant13Alternatives,
  variantSeed,
} from './index.ts';

function taskReview(task: TaskInstance): string {
  const answer = reviewAnswer(task);
  return [
    task.statement,
    ...reviewFigure(task),
    `**Ответ / эталон:** ${answer}`,
    '#### Решение',
    ...task.solution.map(
      (step, index) =>
        `${String(index + 1)}. ${step.text}${step.formula ? `\n\n$$${step.formula}$$` : ''}${step.code ? `\n\n\`\`\`\n${step.code}\n\`\`\`` : ''}`,
    ),
    ...(task.criteria
      ? [
          '#### Учебные критерии',
          ...task.criteria.levels.map(
            (level) => `- ${String(level.score)}: ${level.description}`,
          ),
        ]
      : []),
  ].join('\n\n');
}
export function variantMarkdown(variant: Variant): string {
  const seed = variantSeed(variant),
    alternatives = variant13Alternatives(seed),
    selection = selectedVariant13(variant);
  return (
    [
      `# Учебный вариант ${variant.kind === 'fixed' ? variant.id : 'по seed'}`,
      `Seed: ${JSON.stringify(seed)}. 16 заданий, максимум ${String(examConfig.maxScore)} балл. В №13 выбрана ${selection === 'presentation' ? 'презентация (13.1)' : 'работа с документом (13.2)'}. Альтернативная работа не добавляет номер или баллы.`,
      'Набор предназначен для разбора и содержит решения и эталоны. Это авторские учебные задания. Формат — сверенный проект ОГЭ 2027; критерии практических работ учебные.',
      '[Скачать полный комплект файлов](dataset.zip)',
      ...variant.tasks.map((task) =>
        task.taskNumber === 13
          ? `## Задание №13\n\n### 13.1 Презентация${selection === 'presentation' ? ' — выбрана' : ''}\n\n${taskReview(alternatives.presentation)}\n\n### 13.2 Документ${selection === 'document' ? ' — выбран' : ''}\n\n${taskReview(alternatives.document)}`
          : `## Задание №${String(task.taskNumber)}\n\n${taskReview(task)}`,
      ),
    ].join('\n\n') + '\n'
  );
}
