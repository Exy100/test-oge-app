import { useEffect, useState } from 'react';

type StatementRenderer =
  typeof import('../core/rich-text/render').renderRichText;

/** Prepare rendering before editing starts, without blocking the first paint. */
export function useStatementRenderer() {
  const [renderer, setRenderer] = useState<StatementRenderer | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void import('../core/rich-text/render')
      .then(({ renderRichText }) => {
        if (mounted) setRenderer(() => renderRichText);
      })
      .catch(() => {
        if (mounted)
          setError(
            'Не удалось загрузить практику. Проверь соединение и открой страницу заново.',
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  return { renderer, error };
}
