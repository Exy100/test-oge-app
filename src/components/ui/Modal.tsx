import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button } from './Button';

export function Modal({
  open,
  title,
  description,
  onClose,
  returnFocusRef,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = returnFocusRef?.current ?? document.activeElement;
    element.showModal();
    heading.current?.focus();
    return () => {
      if (element.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open, returnFocusRef]);
  return (
    <dialog
      ref={dialog}
      className="ui-modal"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const targets = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]',
          ),
        ].filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0,
        );
        const first = targets[0];
        const last = targets.at(-1);
        if (!first || !last) {
          event.preventDefault();
          heading.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !targets.some((target) => target === document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="ui-modal-heading">
        <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>
          {title}
        </h2>
        <Button variant="text" onClick={onClose} aria-label="Закрыть окно">
          Закрыть
        </Button>
      </div>
      {description && <p id={`${id}-description`}>{description}</p>}
      <div className="ui-modal-content">{children}</div>
    </dialog>
  );
}
