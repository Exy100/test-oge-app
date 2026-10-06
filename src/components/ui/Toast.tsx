import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Button } from './Button';

export function Toast({
  message,
  tone = 'info',
  onDismiss,
  returnFocusRef,
}: {
  message: string | null;
  tone?: 'info' | 'success' | 'error';
  onDismiss: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const previous = useRef<Element | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message && !container.current?.contains(document.activeElement))
      previous.current = document.activeElement;
  }, [message]);
  return (
    <div
      ref={container}
      className="ui-toast"
      data-tone={tone}
      data-visible={Boolean(message)}
    >
      <div role="status" aria-atomic="true">
        {tone !== 'error' ? message : null}
      </div>
      <div role="alert" aria-atomic="true">
        {tone === 'error' ? message : null}
      </div>
      {message && (
        <Button
          variant="text"
          aria-label="Закрыть уведомление"
          onClick={() => {
            const target = returnFocusRef?.current ?? previous.current;
            onDismiss();
            if (target instanceof HTMLElement && target.isConnected)
              target.focus();
          }}
        >
          Закрыть
        </Button>
      )}
    </div>
  );
}
