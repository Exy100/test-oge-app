import { useEffect, useRef, useState } from 'react';
import { browserCache, browserStore } from '../../core/storage/browser';
import {
  grantAiConsent,
  hasAiConsent,
  type AiMode,
} from '../../lib/ai/consent';
import { feedbackErrorMessage } from '../../lib/ai/contract';
import { checkAiHealth } from '../../lib/ai/http';

type Action<T> = (
  signal: AbortSignal,
  update: (value: T) => void,
) => Promise<T>;
/** Caller keys its panel by the exact outgoing data; unmount/revocation abort all work. */
export function useAiAction<T>(mode: AiMode) {
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Action<T> | null>(null);
  const [value, setValue] = useState<T | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'consent' | 'loading' | 'streaming' | 'done' | 'error' | 'stopped'
  >('idle');
  const [error, setError] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const output = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  useEffect(
    () =>
      browserStore().subscribe(() => {
        if (hasAiConsent(browserStore(), mode)) return;
        active.current?.abort();
        active.current = null;
        browserCache().clear();
        setValue(null);
        setError('');
        setStatus('idle');
      }),
    [mode],
  );
  useEffect(() => {
    if (status === 'done') output.current?.focus();
    if (status === 'error' || status === 'stopped') button.current?.focus();
  }, [status]);
  async function start(action: Action<T>) {
    if (active.current) return;
    pending.current = action;
    const controller = new AbortController();
    active.current = controller;
    setValue(null);
    setError('');
    setStatus('loading');
    try {
      await checkAiHealth(controller.signal);
      controller.signal.throwIfAborted();
      if (!hasAiConsent(browserStore(), mode)) {
        setStatus('consent');
        return;
      }
      const result = await action(controller.signal, (next) => {
        if (!controller.signal.aborted) {
          setValue(next);
          setStatus('streaming');
        }
      });
      controller.signal.throwIfAborted();
      setValue(result);
      setStatus('done');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setValue(null);
        setError(feedbackErrorMessage(cause));
        setStatus('error');
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  }
  function confirm() {
    try {
      grantAiConsent(browserStore(), mode);
      if (pending.current) void start(pending.current);
    } catch {
      setError('Не удалось сохранить согласие. Данные не отправлены.');
      setStatus('error');
    }
  }
  function close() {
    setStatus('idle');
  }
  function stop() {
    active.current?.abort();
    active.current = null;
    setValue(null);
    setStatus('stopped');
  }
  return {
    value,
    status,
    error,
    button,
    output,
    start,
    confirm,
    close,
    stop,
    busy: status === 'loading' || status === 'streaming',
  };
}
