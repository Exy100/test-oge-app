import { buildVariant, variant13Alternatives } from '../core/variants';
import type { TaskInstance } from '../core/types';
import { useState } from 'react';
import { variantTaskHref } from '../lib/variant-links';
import RichText from './RichText';
import Figure from './Figure';
import RandomVariantButton from './RandomVariantButton';

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
function Section({
  task,
  alternatives,
}: {
  task: TaskInstance;
  alternatives: ReturnType<typeof variant13Alternatives>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="variant-task"
      data-task-number={task.taskNumber}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <h2>Задание №{task.taskNumber}</h2>
      </summary>
      {open && (
        <div className="variant-task-body">
          {task.taskNumber === 13 ? (
            <>
              <Task task={alternatives.presentation} />
              <Task task={alternatives.document} />
            </>
          ) : (
            <Task task={task} />
          )}
        </div>
      )}
    </details>
  );
}
export default function RandomVariantBody({ seed }: { seed: string }) {
  const [data] = useState(() => {
    try {
      return {
        variant: buildVariant(seed),
        alternatives: variant13Alternatives(seed),
        error: '',
      };
    } catch {
      return {
        variant: null,
        alternatives: null,
        error: 'Не удалось собрать задания. Открой другой вариант из каталога.',
      };
    }
  });
  if (!data.variant) return <p role="alert">{data.error}</p>;
  const { variant, alternatives } = data;
  return (
    <>
      <p>
        Всего 16 заданий. В №13 выбери одну работу: презентацию или документ.
        Задания №15 и №16 выполняются оба.
      </p>
      <RandomVariantButton label="Другой случайный вариант" />
      <div className="variant-tasks">
        {variant.tasks.map((task) => (
          <Section key={task.id} task={task} alternatives={alternatives} />
        ))}
      </div>
    </>
  );
}
