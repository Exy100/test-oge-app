import { useId } from 'react';
import { sliderValue } from './range';

export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  disabled = false,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const current = sliderValue(value, min, max, step);
  return (
    <div className="ui-slider">
      <label htmlFor={id}>
        {label}
        <span aria-hidden="true">
          {current}
          {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        aria-valuetext={`${String(current)}${unit}`}
        onChange={(event) => {
          onValueChange(event.target.valueAsNumber);
        }}
      />
      <div className="ui-slider-limits" aria-hidden="true">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
