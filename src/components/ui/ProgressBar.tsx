import { useId } from 'react';

export function ProgressBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value?: number;
  max?: number;
}) {
  const id = useId();
  if (
    !Number.isFinite(max) ||
    max <= 0 ||
    (value !== undefined && !Number.isFinite(value))
  )
    throw new RangeError(
      'Прогресс требует конечного значения и положительного максимума.',
    );
  const current =
    value === undefined ? undefined : Math.min(max, Math.max(0, value));
  return (
    <div className="ui-progress">
      <label htmlFor={id}>
        {label}
        <span>
          {current === undefined
            ? 'Выполняется'
            : `${String(current)} / ${String(max)}`}
        </span>
      </label>
      <progress id={id} value={current} max={max} />
    </div>
  );
}
