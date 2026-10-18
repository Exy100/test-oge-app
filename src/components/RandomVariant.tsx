import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { readVariantSeed, VariantLinkError } from '../lib/variant-links';

export default function RandomVariant() {
  const [view, setView] = useState<{
    Body: ComponentType<{ seed: string }>;
    seed: string;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    async function load() {
      await Promise.resolve();
      try {
        const seed = readVariantSeed(window.location.search);
        const { default: Body } = await import('./RandomVariantBody');
        if (current) setView({ Body, seed });
      } catch (cause: unknown) {
        if (current)
          setError(
            cause instanceof VariantLinkError
              ? cause.message
              : 'Не удалось собрать вариант. Обнови страницу или выбери готовый вариант в каталоге.',
          );
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!view)
    return (
      <div className="variant-loading" role="status">
        Читаем ссылку и собираем задания…
      </div>
    );
  return <view.Body seed={view.seed} />;
}
