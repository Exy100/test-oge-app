import { useState } from 'react';
import InteractiveHost from '../components/lessons/InteractiveHost';
import { useHydrated } from '../components/useHydrated';

export default function InteractiveHarness({
  modulePath,
  options = [],
}: {
  modulePath: string;
  options?: readonly { title: string; path: string }[];
}) {
  const [path, setPath] = useState(modulePath);
  const [mounted, setMounted] = useState(false);
  const ready = useHydrated();
  const [failed, setFailed] = useState(false);
  return (
    <section aria-labelledby="harness-title">
      <h2 id="harness-title">Повторное подключение и ошибки</h2>
      {options.length > 0 && (
        <label>
          Модуль для проверки
          <select
            value={path}
            disabled={!ready}
            onChange={(event) => {
              setPath(event.target.value);
              setMounted(false);
              setFailed(false);
            }}
          >
            <option value={modulePath}>Проверочная сцена</option>
            {options.map((option) => (
              <option key={option.path} value={option.path}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
      )}
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
            modulePath={path}
            parameters={{ fail: failed }}
          />
        )}
      </div>
    </section>
  );
}
