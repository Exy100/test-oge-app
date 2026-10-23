import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { compareBoolean, logicGoals } from '../lib/interactives/logic';

export default function LogicBuilder({ id, parameters }: InteractiveProps) {
  const initial = parameters.goal ?? 'and';
  if (initial !== 'and' && initial !== 'neither' && initial !== 'difference')
    throw new RangeError('Неизвестная логическая цель.');
  const [goal, setGoal] = useState<keyof typeof logicGoals>(initial);
  const [source, setSource] = useState('A');
  const [a, setA] = useState(false),
    [b, setB] = useState(false);
  const [checked, setChecked] = useState(false);
  let comparison: ReturnType<typeof compareBoolean> | undefined;
  let error = '';
  try {
    comparison = compareBoolean(source, logicGoals[goal].expression);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь выражение.';
  }
  const current = comparison?.rows.find((row) => row.a === a && row.b === b);
  function edit(next: string) {
    setSource(next);
    setChecked(false);
  }
  return (
    <div className="information-lab">
      <p>
        A и B — независимые высказывания. Составь выражение для цели:
        проверяются все четыре набора, а не только выбранный. В №3 после
        подстановки неравенств отдельно учитывай область значений X.
      </p>
      <label htmlFor={`${id}-goal`}>Логическая цель</label>
      <select
        id={`${id}-goal`}
        value={goal}
        onChange={(event) => {
          setGoal(event.target.value as keyof typeof logicGoals);
          setChecked(false);
        }}
      >
        {Object.entries(logicGoals).map(([value, item]) => (
          <option key={value} value={value}>
            {item.title}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-expression`}>Твоё выражение</label>
      <input
        id={`${id}-expression`}
        value={source}
        maxLength={160}
        spellCheck={false}
        onChange={(event) => {
          edit(event.target.value);
        }}
        aria-describedby={`${id}-grammar`}
      />
      <p id={`${id}-grammar`}>
        Используй A, B, НЕ, И, ИЛИ и скобки. Приоритет: скобки, НЕ, И, ИЛИ.
        Буквы A и B можно набрать латиницей; похожие А и В кириллицей тоже
        принимаются.
      </p>
      <div className="interactive-toolbar">
        {['A', 'B', 'НЕ ', ' И ', ' ИЛИ ', '(', ')'].map((token) => (
          <button
            type="button"
            className="button button-light"
            key={token}
            onClick={() => {
              edit(source + token);
            }}
          >{`Добавить ${token.trim()}`}</button>
        ))}
        <button
          className="button button-light"
          type="button"
          onClick={() => {
            edit('');
          }}
        >
          Очистить выражение
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <label>
        <input
          type="checkbox"
          checked={a}
          onChange={(event) => {
            setA(event.target.checked);
          }}
        />{' '}
        A истинно
      </label>
      <label>
        <input
          type="checkbox"
          checked={b}
          onChange={(event) => {
            setB(event.target.checked);
          }}
        />{' '}
        B истинно
      </label>
      <svg
        role="img"
        viewBox="0 0 350 140"
        aria-labelledby={`${id}-logic-title`}
      >
        <title id={`${id}-logic-title`}>
          Выбранные входы A={Number(a)}, B={Number(b)}. Результат:{' '}
          {current ? Number(current.actual) : 'проверь запись'}
        </title>
        <text x="4" y="35" fill="currentColor">
          A={Number(a)}
        </text>
        <text x="4" y="110" fill="currentColor">
          B={Number(b)}
        </text>
        <path
          d="M45 30 H105 V60 H140 M45 105 H105 V80 H140 M245 70 H275"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="140"
          y="45"
          width="105"
          height="50"
          rx="8"
          fill="none"
          stroke="currentColor"
        />
        <text x="150" y="75" fill="currentColor">
          Условие
        </text>
        <text x="280" y="75" fill="currentColor">
          {current ? Number(current.actual) : '?'}
        </text>
      </svg>
      {comparison && (
        <div
          className="lab-table-scroll lab-table-wide"
          tabIndex={0}
          role="region"
          aria-label="Таблица истинности"
        >
          <table>
            <caption>0 — ложь, 1 — истина; отмечен выбранный набор</caption>
            <thead>
              <tr>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">Цель</th>
                <th scope="col">Твоё</th>
                <th scope="col">Набор</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr
                  key={String(row.a) + String(row.b)}
                  data-current={row.a === a && row.b === b}
                >
                  <td>{Number(row.a)}</td>
                  <td>{Number(row.b)}</td>
                  <td>{Number(row.expected)}</td>
                  <td>{Number(row.actual)}</td>
                  <td>{row.a === a && row.b === b ? 'Выбран' : 'Другой'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        className="button button-dark"
        disabled={!comparison}
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить эквивалентность
      </button>
      <p role="status">
        {checked && comparison
          ? comparison.equivalent
            ? 'Верно: выражения совпадают на всех четырёх наборах.'
            : (() => {
                const row = comparison.rows.find(
                  (item) => item.actual !== item.expected,
                );
                return row
                  ? `Пока неэквивалентно. При A=${String(Number(row.a))}, B=${String(Number(row.b))} цель даёт ${String(Number(row.expected))}, а твоё выражение — ${String(Number(row.actual))}.`
                  : '';
              })()
          : ''}
      </p>
    </div>
  );
}
