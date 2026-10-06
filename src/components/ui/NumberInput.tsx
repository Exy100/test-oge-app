import { useId } from 'react';
import type { ComponentPropsWithRef } from 'react';

export type NumberInputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'size'
> & { label: string; hint?: string; error?: string };
export function NumberInput({
  label,
  hint,
  error,
  id: providedId,
  className = '',
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: NumberInputProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptions = [
    describedBy,
    hint ? `${id}-hint` : '',
    error ? `${id}-error` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`ui-number-input ${className}`}>
      <label htmlFor={id}>
        {label}
        {props.required && <span> (обязательно)</span>}
      </label>
      <input
        {...props}
        id={id}
        type="number"
        aria-invalid={error ? true : invalid}
        aria-describedby={descriptions || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="ui-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
