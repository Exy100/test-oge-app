import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useHydrated } from '../useHydrated';
import VariantExam, { type ExamIdentity } from './VariantExam';
import VariantFiles from './VariantFiles';

/** The small setup screen loads with the entry; generators load on Start. */
export default function ExamEntry({
  variantId,
  seed,
  children,
}: ExamIdentity & { children: ReactNode }) {
  const ready = useHydrated();
  const [requested, setRequested] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('exam')) {
      queueMicrotask(() => {
        setRequested(true);
      });
    }
  }, []);
  useEffect(() => {
    if (!requested && restoreFocus.current) {
      start.current?.focus();
      restoreFocus.current = false;
    }
  }, [requested]);
  function changeUrl(value: boolean) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('exam', '1');
    else url.searchParams.delete('exam');
    window.history.replaceState(null, '', url);
  }
  if (requested)
    return (
      <VariantExam
        variantId={variantId}
        seed={seed}
        onClose={() => {
          changeUrl(false);
          restoreFocus.current = true;
          setRequested(false);
        }}
      />
    );
  return (
    <>
      <p className="variant-task-action">
        <button
          ref={start}
          className="button button-dark"
          type="button"
          disabled={!ready}
          onClick={() => {
            changeUrl(true);
            setRequested(true);
          }}
        >
          Пройти с таймером
        </button>
      </p>
      <VariantFiles variantId={variantId} seed={seed} />
      {children}
    </>
  );
}
