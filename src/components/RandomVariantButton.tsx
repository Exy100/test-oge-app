import { useState } from 'react';
import { useHydrated } from './useHydrated';
import { randomVariantHref } from '../lib/variant-links';

export default function RandomVariantButton({
  label = 'Случайный вариант',
}: {
  label?: string;
}) {
  const ready = useHydrated();
  const [error, setError] = useState('');
  return (
    <div>
      <button
        className="button button-dark"
        type="button"
        disabled={!ready}
        onClick={() => {
          setError('');
          try {
            window.location.assign(randomVariantHref(crypto.randomUUID()));
          } catch {
            setError(
              'Не удалось открыть случайный вариант. Попробуй ещё раз или выбери вариант из списка.',
            );
          }
        }}
      >
        {label}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
