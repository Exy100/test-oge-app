import { useEffect, useMemo, useState } from 'react';
import { VariantSchema } from '../../core/schemas';
import type { Variant } from '../../core/types';
import type { ExamAttempt } from '../../core/variants/exam';

/** Keep generator verification off the UI thread; terminate on completion or navigation. */
export function useResultVariant(attempt: ExamAttempt, supplied?: Variant) {
  const { variantId, seed, variant13 } = attempt;
  const key = JSON.stringify([variantId, seed, variant13]);
  const [loaded, setLoaded] = useState<{
    key: string;
    variant: Variant | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (supplied) return;
    let active = true;
    let worker: Worker | null = null;
    const fail = () => {
      if (active)
        setLoaded({
          key,
          variant: null,
          error:
            'Не удалось восстановить вариант. Обнови страницу; сохранённые ответы останутся в истории.',
        });
    };
    const finish = (value: unknown) => {
      if (!active) return;
      try {
        setLoaded({ key, variant: VariantSchema.parse(value), error: '' });
      } catch {
        fail();
      }
    };
    const timeout = setTimeout(() => {
      worker?.terminate();
      fail();
    }, 15000);
    try {
      if (typeof Worker === 'undefined') {
        void import('../../core/variants/result-variant')
          .then(({ buildExamVariant }) => {
            if (active)
              finish(buildExamVariant({ variantId, seed, variant13 }));
          })
          .catch(fail)
          .finally(() => {
            clearTimeout(timeout);
          });
      } else {
        worker = new Worker(
          new URL('../../core/variants/result.worker.ts', import.meta.url),
          { type: 'module' },
        );
        worker.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timeout);
          worker?.terminate();
          const data = event.data;
          if (
            typeof data === 'object' &&
            data !== null &&
            Reflect.get(data, 'ok') === true
          )
            finish(Reflect.get(data, 'variant'));
          else fail();
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker?.terminate();
          fail();
        };
        worker.postMessage({ variantId, seed, variant13 });
      }
    } catch {
      clearTimeout(timeout);
      queueMicrotask(fail);
    }
    return () => {
      active = false;
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [variantId, seed, variant13, key, supplied]);
  return useMemo(
    () =>
      supplied
        ? { variant: supplied, error: '' }
        : loaded?.key === key
          ? loaded
          : { variant: null, error: '' },
    [supplied, loaded, key],
  );
}
