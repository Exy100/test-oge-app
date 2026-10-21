import { useEffect, useMemo, useState } from 'react';
import { useHydrated } from '../useHydrated';
import { useStoredAreas } from '../useStoredAreas';
import { attemptResultHref, readResultAttempt } from '../../lib/variant-links';
import { fixedVariants } from '../../core/variants/catalog';
import { sitePath } from '../../lib/site';
import { Button } from '../ui/Button';

type View = (typeof import('./ExamFinished'))['default'];
export default function VariantResult({ variantId }: { variantId: string }) {
  const ready = useHydrated();
  const areas = useStoredAreas();
  const id = useMemo(() => {
    if (!ready) return null;
    try {
      return readResultAttempt(window.location.search);
    } catch {
      return null;
    }
  }, [ready]);
  const attempt = areas.variantAttempts.entries.find(
    (row) =>
      row.id === id &&
      attemptResultHref(row) !== null &&
      (variantId === 'random'
        ? !fixedVariants.some((fixed) => fixed.id === row.variantId)
        : row.variantId === variantId),
  );
  const [Content, setContent] = useState<View | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!attempt) return;
    let current = true;
    void import('./ExamFinished')
      .then((module) => {
        if (current) setContent(() => module.default);
      })
      .catch(() => {
        if (current)
          setError('Не удалось загрузить разбор. Ответы остаются в истории.');
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  if (!ready || !attempt)
    return (
      <div>
        <p role="status" className="result-lookup-status">
          {ready
            ? 'Попытка не найдена для этого варианта в истории этого браузера.'
            : 'Читаем историю этого браузера…'}
        </p>
        <p>
          Результаты хранятся на твоём устройстве. Открой попытку из истории или
          импортируй свою резервную копию в настройках. Передача этой ссылки не
          передаёт ответы.
        </p>
        <p>
          <a href={sitePath('/variants/')}>Открыть историю вариантов</a> ·{' '}
          <a href={sitePath('/settings/')}>Настройки и импорт</a>
        </p>
      </div>
    );
  if (Content) return <Content attempt={attempt} />;
  return (
    <div className="result-loading">
      <p role={error ? 'alert' : 'status'}>{error || 'Открываем результат…'}</p>
      {error && (
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          Повторить загрузку
        </Button>
      )}
    </div>
  );
}
