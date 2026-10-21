import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type { TaskInstance } from '../../core/types';
import { fixedVariants } from '../../core/variants/catalog';
import { readPrintIdentity, attemptVariantHref } from '../../lib/variant-links';
import FileMemo from './FileMemo';
import { useHydrated } from '../useHydrated';
import { Button } from '../ui/Button';
import '../../styles/variant-files.css';

export default function VariantPrint() {
  const ready = useHydrated();
  const parsed = useMemo(() => {
    if (!ready) return null;
    try {
      return readPrintIdentity(window.location.search);
    } catch {
      return null;
    }
  }, [ready]);
  const [loaded, setLoaded] = useState<{
    Content: ComponentType<{ tasks: TaskInstance[] }>;
    tasks: TaskInstance[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (ready && !parsed)
    return (
      <p role="alert">
        Не удалось открыть вариант для печати. Вернись в каталог и выбери
        вариант.
      </p>
    );
  const href = parsed ? attemptVariantHref(parsed) : null;
  async function prepare() {
    if (!parsed) return;
    setBusy(true);
    setError('');
    try {
      const module = await import('./VariantPrintContent');
      const tasks = module.preparePrintConditions(parsed);
      if (alive.current) setLoaded({ Content: module.default, tasks });
    } catch {
      if (alive.current)
        setError(
          'Не удалось подготовить условия. Повтори попытку или обнови страницу.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="variant-print">
      <h2>
        {parsed
          ? fixedVariants.some((row) => row.id === parsed.variantId)
            ? `Вариант ${parsed.variantId}`
            : 'Случайный вариант'
          : 'Учебный вариант'}
      </h2>
      <p className="variant-print-seed">
        Seed: {parsed ? parsed.seed : 'читаем ссылку…'}
      </p>
      <p>
        Авторские задания по сверенному проекту ОГЭ 2027. 16 номеров · 150 минут
        · максимум 21 балл. Выбери одну работу №13; №15 и №16 выполняй оба.
      </p>
      <div className="variant-print-controls">
        <p>
          Подготовь все условия, затем печатай на A4 или сохраняй в PDF через
          диалог браузера. Проверь предварительный просмотр. Печать не
          останавливает таймер в другой вкладке.
        </p>
        {loaded ? (
          <Button
            onClick={() => {
              window.print();
            }}
          >
            Печатать условия и памятку
          </Button>
        ) : (
          <Button
            disabled={!ready || busy}
            onClick={() => {
              void prepare();
            }}
          >
            {busy ? 'Готовим условия…' : 'Подготовить условия для печати'}
          </Button>
        )}
        {error && <p role="alert">{error}</p>}
        {href && (
          <p>
            <a href={href}>Открыть вариант</a>
          </p>
        )}
      </div>
      {!loaded && (
        <p className="variant-print-notice" role="status">
          Условия ещё не подготовлены. Нажми «Подготовить условия для печати»,
          чтобы добавить все 16 номеров к памятке.
        </p>
      )}
      <FileMemo />
      {loaded && <loaded.Content tasks={loaded.tasks} />}
    </div>
  );
}
