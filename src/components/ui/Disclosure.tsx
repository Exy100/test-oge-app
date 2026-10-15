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
  // Fixed at mount: later renders never override the reader's native toggle.
  const [initialOpen] = useState(defaultOpen);
  return (
    <details className="ui-disclosure" open={initialOpen}>
      <summary>
        {summary}
        <span aria-hidden="true">
          <span className="ui-disclosure-closed">+</span>
          <span className="ui-disclosure-open">−</span>
        </span>
      </summary>
      <div>{children}</div>
    </details>
  );
}
