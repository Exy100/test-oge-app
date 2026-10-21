import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useHydrated } from '../useHydrated';
import VariantExam, { type ExamIdentity } from './VariantExam';
import VariantFiles from './VariantFiles';
import { Button } from '../ui/Button';

/** The small setup screen loads with the entry; generators load on Start. */
export default function ExamEntry({
  variantId,
  seed,
  children,
}: ExamIdentity & { children: ReactNode }) {
  const ready = useHydrated();
  const [requested, setRequested] = useState<'exam' | 'training' | null>(null);
  const start = useRef<HTMLButtonElement>(null);
  const trainingStart = useRef<HTMLButtonElement>(null);
  const lastMode = useRef<'exam' | 'training'>('exam');
  const restoreFocus = useRef(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('exam') || query.has('training')) {
      queueMicrotask(() => {
        setRequested(query.has('exam') ? 'exam' : 'training');
      });
    }
  }, []);
  useEffect(() => {
    if (!requested && restoreFocus.current) {
      (lastMode.current === 'training'
        ? trainingStart
        : start
      ).current?.focus();
      restoreFocus.current = false;
    }
  }, [requested]);
  function changeUrl(value: 'exam' | 'training' | null) {
    const url = new URL(window.location.href);
    url.searchParams.delete('exam');
    url.searchParams.delete('training');
    if (value) url.searchParams.set(value, '1');
    window.history.replaceState(null, '', url);
  }
  if (requested)
    return (
      <VariantExam
        variantId={variantId}
        seed={seed}
        mode={requested}
        onClose={() => {
          changeUrl(null);
          lastMode.current = requested;
          restoreFocus.current = true;
          setRequested(null);
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
            changeUrl('exam');
            setRequested('exam');
          }}
        >
          Пройти с таймером
        </button>{' '}
        <Button
          ref={trainingStart}
          variant="secondary"
          disabled={!ready}
          onClick={() => {
            changeUrl('training');
            setRequested('training');
          }}
        >
          Тренироваться без таймера
        </Button>
      </p>
      <VariantFiles variantId={variantId} seed={seed} />
      {children}
    </>
  );
}
