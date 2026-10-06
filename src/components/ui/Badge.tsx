import type { ComponentPropsWithoutRef } from 'react';

export function Badge({
  tone = 'accent',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'accent' | 'success' | 'error';
}) {
  return (
    <span {...props} className={`ui-badge ${className}`} data-tone={tone} />
  );
}
