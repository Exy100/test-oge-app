import type { Variant } from '../types';
import { reviewFigure } from '../generators/review';
import { variant13Alternatives, variantSeed } from './index';

/** Only public conditions are exported; never serialize full task instances. */
export function variantConditionTasks(variant: Variant) {
  const alternatives = variant13Alternatives(variantSeed(variant));
  return variant.tasks.flatMap((task) =>
    task.taskNumber === 13
      ? [alternatives.presentation, alternatives.document]
      : [task],
  );
}

export function variantConditionsText(variant: Variant): string {
  return (
    [
      `Учебный вариант ${variant.kind === 'fixed' ? variant.id : 'по seed'}`,
      `Seed: ${JSON.stringify(variantSeed(variant))}`,
      'Авторские задания по сверенному проекту ОГЭ 2027. 16 номеров, 150 минут, максимум 21 балл. Выбери одну работу №13; №15 и №16 выполняй оба. Условия без ответов и решений.',
      ...variantConditionTasks(variant).map((task) =>
        [
          `## Задание №${String(task.taskNumber)}${task.variant13 === 'presentation' ? '.1 — Презентация' : task.variant13 === 'document' ? '.2 — Документ' : ''}`,
          task.statement,
          ...reviewFigure(task),
        ].join('\n\n'),
      ),
    ].join('\n\n') + '\n'
  );
}
