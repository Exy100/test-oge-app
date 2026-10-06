import type { ComponentPropsWithoutRef } from 'react';

export function Card({
  tone = 'surface',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'> & { tone?: 'surface' | 'soft' }) {
  return <div {...props} className={`ui-card ${className}`} data-tone={tone} />;
}
