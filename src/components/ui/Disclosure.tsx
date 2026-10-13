import { useRef } from 'react';
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
  const initialOpen = useRef(defaultOpen);
  return (
    <details className="ui-disclosure" open={initialOpen.current}>
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
