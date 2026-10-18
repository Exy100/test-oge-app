import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { examConfig } from '../core/exam/exam.config';
import { VARIANT_VERSION } from '../core/variants/catalog';
import type { TaskNumber } from '../core/types';
import type { RandomVariantData } from './variants/RandomVariantContent';
import RandomVariantButton from './RandomVariantButton';
import ExamEntry from './variants/ExamEntry';

type Loaded = {
  Content: ComponentType<{ data: RandomVariantData; number: TaskNumber }>;
  data: RandomVariantData;
};
const numbers = Array.from(
  { length: examConfig.taskCount },
  (_, index) => (index + 1) as TaskNumber,
);
function Section({
  number,
  loaded,
  error,
  load,
}: {
  number: TaskNumber;
  loaded: Loaded | null;
  error: string;
  load: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="variant-task"
      data-task-number={number}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) load();
      }}
    >
      <summary>
        <h2>Задание №{number}</h2>
      </summary>
      {open && (
        <div className="variant-task-body">
          {loaded ? (
            <loaded.Content data={loaded.data} number={number} />
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <p role="status">Собираем условия задания…</p>
          )}
        </div>
      )}
    </details>
  );
}
export default function RandomVariantBody({ seed }: { seed: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function load() {
    if (loaded || pending.current) return;
    pending.current = true;
    setError('');
    void import('./variants/RandomVariantContent')
      .then((module) => {
        const data = module.prepareRandomVariant(seed);
        if (alive.current) setLoaded({ Content: module.default, data });
      })
      .catch(() => {
        if (alive.current)
          setError(
            'Не удалось открыть условия. Обнови страницу или выбери другой вариант в каталоге.',
          );
      })
      .finally(() => {
        pending.current = false;
      });
  }
  return (
    <ExamEntry variantId={`${VARIANT_VERSION}:${seed}`} seed={seed}>
      <p>
        Всего 16 заданий. В №13 выбери одну работу: презентацию или документ.
        Задания №15 и №16 выполняются оба.
      </p>
      <RandomVariantButton label="Другой случайный вариант" />
      <div className="variant-tasks">
        {numbers.map((number) => (
          <Section
            key={number}
            number={number}
            loaded={loaded}
            error={error}
            load={load}
          />
        ))}
      </div>
    </ExamEntry>
  );
}
