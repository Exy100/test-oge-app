import { buildFixedVariant, buildVariant } from '../../core/variants';
import { fixedVariants } from '../../core/variants/catalog';
import { variantConditionTasks } from '../../core/variants/conditions';
import type { ExamIdentity } from './VariantExam';
import type { TaskInstance } from '../../core/types';
import RichText from '../RichText';
import Figure from '../Figure';

export function preparePrintConditions({ variantId, seed }: ExamIdentity) {
  const variant = fixedVariants.some((row) => row.id === variantId)
    ? buildFixedVariant(variantId)
    : buildVariant(seed);
  return variantConditionTasks(variant);
}

export default function VariantPrintContent({
  tasks,
}: {
  tasks: TaskInstance[];
}) {
  return (
    <>
      {tasks.map((task) => (
        <section className="variant-print-task" key={task.id}>
          <h2>
            Задание №{task.taskNumber}
            {task.variant13 === 'presentation'
              ? '.1 — Презентация'
              : task.variant13 === 'document'
                ? '.2 — Документ'
                : ''}
          </h2>
          <RichText source={task.statement} />
          {task.figure && (
            <Figure
              spec={task.figure}
              label={`Схема к заданию №${String(task.taskNumber)}`}
            />
          )}
        </section>
      ))}
    </>
  );
}
