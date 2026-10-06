import { useState } from 'react';
import type { ReactNode } from 'react';

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="ui-disclosure"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        {summary}
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </summary>
      <div>{children}</div>
    </details>
  );
}
