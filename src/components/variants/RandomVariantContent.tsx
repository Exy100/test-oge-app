import { buildVariant, variant13Alternatives } from '../../core/variants';
import type { TaskInstance, TaskNumber } from '../../core/types';
import { variantTaskHref } from '../../lib/variant-links';
import RichText from '../RichText';
import Figure from '../Figure';

export function prepareRandomVariant(seed: string) {
  return {
    variant: buildVariant(seed),
    alternatives: variant13Alternatives(seed),
  };
}
export type RandomVariantData = ReturnType<typeof prepareRandomVariant>;
function Task({ task }: { task: TaskInstance }) {
  const number =
    task.variant13 === 'presentation'
      ? '13.1'
      : task.variant13 === 'document'
        ? '13.2'
        : String(task.taskNumber);
  return (
    <>
      {task.variant13 && (
        <h3>
          {number} —{' '}
          {task.variant13 === 'presentation' ? 'Презентация' : 'Документ'}
        </h3>
      )}
      <RichText source={task.statement} />
      {task.figure && (
        <Figure spec={task.figure} label={`Схема к заданию №${number}`} />
      )}
      <p className="variant-task-action">
        <a className="button button-dark" href={variantTaskHref(task)}>
          Решить задание №{number} в практике
        </a>
      </p>
    </>
  );
}
export default function RandomVariantContent({
  data,
  number,
}: {
  data: RandomVariantData;
  number: TaskNumber;
}) {
  const task = data.variant.tasks.find((row) => row.taskNumber === number);
  if (!task)
    return (
      <p role="alert">
        Не удалось открыть этот номер. Выбери другой вариант в каталоге.
      </p>
    );
  return number === 13 ? (
    <>
      <Task task={data.alternatives.presentation} />
      <Task task={data.alternatives.document} />
    </>
  ) : (
    <Task task={task} />
  );
}
