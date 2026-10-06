import type { ComponentPropsWithRef } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const appearance =
    variant === 'text'
      ? 'text-button'
      : `button button-${variant === 'primary' ? 'dark' : 'light'}`;
  return (
    <button
      {...props}
      type={type}
      className={`${appearance} ui-button ${className}`}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {children}
      {loading && <span className="ui-sr-only"> — выполняется</span>}
    </button>
  );
}
