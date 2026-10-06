import { useId } from 'react';

export interface SegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function SegmentedControl({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  options: readonly SegmentOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="ui-segmented" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => {
                onValueChange(option.value);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
