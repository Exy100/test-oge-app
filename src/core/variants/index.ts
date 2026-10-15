import { bankTasks } from '../banks/index.ts';
import { examConfig } from '../exam/exam.config.ts';
import { generatorsForTask } from '../generators/index.ts';
import { Rng } from '../rng.ts';
import type { TaskInstance, TaskNumber, Variant } from '../types.ts';

export const VARIANT_VERSION = 'informatics-variant-v1';
export type Variant13Choice = 'presentation' | 'document';
export const fixedVariants = Object.freeze(
  Array.from({ length: 10 }, (_, index) => {
    const id = `V${String(index + 1).padStart(2, '0')}`;
    return Object.freeze({ id, seed: `${VARIANT_VERSION}:${id}` });
  }),
);
function choice13(value: unknown): asserts value is Variant13Choice {
  if (value !== 'presentation' && value !== 'document')
    throw new Error('Для №13 выбери презентацию или документ.');
}
export function variant13Alternatives(
  seed: string,
): Record<Variant13Choice, TaskInstance> {
  const rng = new Rng(seed);
  const pick = (kind: Variant13Choice): TaskInstance =>
    structuredClone(
      rng
        .fork(`${VARIANT_VERSION}:13:${kind}`)
        .pick(bankTasks.filter((task) => task.variant13 === kind)),
    );
  return { presentation: pick('presentation'), document: pick('document') };
}
/** Assemble one selected task per number; the other №13 remains outside scoring. */
export function buildVariant(
  seed: string,
  selection: Variant13Choice = 'presentation',
): Variant {
  choice13(selection);
  const rng = new Rng(seed),
    alternatives = variant13Alternatives(seed);
  const tasks = Array.from(
    { length: examConfig.taskCount },
    (_, index): TaskInstance => {
      const number = (index + 1) as TaskNumber;
      if (number === 13) return alternatives[selection];
      const generator = rng
        .fork(`${VARIANT_VERSION}:generator:${String(number)}`)
        .pick(generatorsForTask(number));
      const taskSeed = JSON.stringify([VARIANT_VERSION, seed, number]);
      const task = generator.generate(taskSeed);
      if (
        task.taskNumber !== number ||
        task.seed !== taskSeed ||
        task.generatorId !== generator.id ||
        !generator.verify(task)
      )
        throw new Error(
          `Генератор №${String(number)} не прошёл проверку сборщика.`,
        );
      return task;
    },
  );
  const maximum = tasks.reduce(
    (sum, task) => sum + (task.criteria?.max ?? 1),
    0,
  );
  if (
    new Set(tasks.map((task) => task.id)).size !== examConfig.taskCount ||
    maximum !== examConfig.maxScore
  )
    throw new Error(
      'Состав или максимум варианта не соответствует конфигурации экзамена.',
    );
  return { kind: 'generated', id: `${VARIANT_VERSION}:${seed}`, seed, tasks };
}
export function buildFixedVariant(
  id: string,
  selection: Variant13Choice = 'presentation',
): Variant {
  const fixed = fixedVariants.find((item) => item.id === id);
  if (!fixed) throw new Error('Фиксированный вариант не найден.');
  return {
    kind: 'fixed',
    id: fixed.id,
    tasks: buildVariant(fixed.seed, selection).tasks,
  };
}
export function variantSeed(variant: Variant): string {
  if (variant.kind === 'generated') return variant.seed;
  const fixed = fixedVariants.find((item) => item.id === variant.id);
  if (!fixed) throw new Error('Фиксированный вариант не найден.');
  return fixed.seed;
}
export function selectedVariant13(variant: Variant): Variant13Choice {
  const selected = variant.tasks.find(
    (task) => task.taskNumber === 13,
  )?.variant13;
  if (!selected) throw new Error('В варианте не выбрана альтернатива №13.');
  return selected;
}
export function variantFileTasks(variant: Variant): readonly TaskInstance[] {
  const alternatives = variant13Alternatives(variantSeed(variant));
  return variant.tasks.flatMap((task) =>
    task.taskNumber === 13
      ? [alternatives.presentation, alternatives.document]
      : task.datasetId
        ? [task]
        : [],
  );
}
export function variantFileKey(task: TaskInstance): string {
  return `${String(task.taskNumber).padStart(2, '0')}${task.variant13 ? `-${task.variant13}` : ''}`;
}
