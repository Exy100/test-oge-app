import { useId, useRef, type KeyboardEvent } from 'react';

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
  const groupRef = useRef<HTMLFieldSetElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;

    const inputs = Array.from(
      groupRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]:not(:disabled)',
      ) ?? [],
    );
    const index = inputs.indexOf(event.currentTarget);
    if (index < 0) return;
    const next = inputs[(index + direction + inputs.length) % inputs.length];
    if (!next) return;

    // WebKit does not wrap native radio navigation at the group boundary.
    event.preventDefault();
    next.focus();
    next.click();
  }

  return (
    <fieldset ref={groupRef} className="ui-segmented" disabled={disabled}>
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
              onKeyDown={handleKeyDown}
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
