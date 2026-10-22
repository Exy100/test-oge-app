import { useState } from 'react';
import InteractiveHost from '../components/lessons/InteractiveHost';
import { useHydrated } from '../components/useHydrated';

export default function InteractiveHarness({
  modulePath,
}: {
  modulePath: string;
}) {
  const [mounted, setMounted] = useState(false);
  const ready = useHydrated();
  const [failed, setFailed] = useState(false);
  return (
    <section aria-labelledby="harness-title">
      <h2 id="harness-title">Повторное подключение и ошибки</h2>
      <button
        type="button"
        className="button"
        disabled={!ready}
        onClick={() => {
          setMounted((value) => !value);
        }}
      >
        {mounted ? 'Отключить сцену' : 'Подключить сцену'}
      </button>{' '}
      <label>
        <input
          type="checkbox"
          disabled={!ready}
          checked={failed}
          onChange={(event) => {
            setFailed(event.target.checked);
          }}
        />{' '}
        Ошибка отрисовки
      </label>
      <div id="harness-scene">
        {mounted && (
          <InteractiveHost
            id="harness"
            modulePath={modulePath}
            parameters={{ fail: failed }}
          />
        )}
      </div>
    </section>
  );
}
