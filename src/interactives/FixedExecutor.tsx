import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  checkExecutor,
  executorLabs,
  executorTrace,
} from '../lib/interactives/executors';

export default function FixedExecutor({ id, parameters }: InteractiveProps) {
  const initial = parameters.preset ?? 'multiply';
  if (initial !== 'multiply' && initial !== 'square')
    throw new RangeError('Неизвестный исполнитель.');
  const [preset, setPreset] = useState<keyof typeof executorLabs>(initial);
  const [program, setProgram] = useState(''),
    [cursor, setCursor] = useState(0),
    [checked, setChecked] = useState(false);
  const { problem } = executorLabs[preset];
  let trace: bigint[] = [],
    error = '';
  try {
    trace = executorTrace(problem, program);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь команды.';
  }
  const step = Math.min(cursor, trace.length - 1);
  function edit(value: string) {
    setProgram(value);
    setCursor(0);
    setChecked(false);
  }
  const rule =
    'square' in problem
      ? 'возвести в квадрат'
      : `умножить на ${String(problem.multiplier)}`;
  return (
    <div className="information-lab">
      <label htmlFor={`${id}-preset`}>Команды исполнителя</label>
      <select
        id={`${id}-preset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value as keyof typeof executorLabs);
          edit('');
        }}
      >
        {Object.entries(executorLabs).map(([key, lab]) => (
          <option key={key} value={key}>
            {lab.title}
          </option>
        ))}
      </select>
      <p>
        Начало: {problem.start}. Цель: {problem.end}. Команда 1 — {rule};
        команда 2 — прибавить {problem.add}. Подходит любая программа из 1–5
        команд.
      </p>
      <label htmlFor={`${id}-program`}>Программа из команд 1 и 2</label>
      <input
        id={`${id}-program`}
        value={program}
        maxLength={32}
        inputMode="numeric"
        spellCheck={false}
        onChange={(event) => {
          edit(event.target.value);
        }}
      />
      <div className="interactive-toolbar">
        {['1', '2'].map((command) => (
          <button
            key={command}
            className="button button-light"
            type="button"
            disabled={program.length >= 5}
            onClick={() => {
              edit(program + command);
            }}
          >
            Добавить команду {command}
          </button>
        ))}
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            edit(program.slice(0, -1));
          }}
        >
          Удалить последнюю
        </button>
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            edit('');
          }}
        >
          Очистить программу
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {trace.length > 0 && (
        <>
          <svg
            role="img"
            viewBox="0 0 350 100"
            aria-labelledby={`${id}-trace-title`}
          >
            <title id={`${id}-trace-title`}>
              После {step} команд значение {String(trace[step])}; цель{' '}
              {problem.end}
            </title>
            <rect
              x="6"
              y="10"
              width="338"
              height="80"
              rx="8"
              fill="none"
              stroke="currentColor"
            />
            <text x="18" y="40" fill="currentColor">
              Шаг {step} из {program.length}
            </text>
            <text x="18" y="73" fill="currentColor">
              Значение: {String(trace[step])}
            </text>
          </svg>
          <div className="interactive-toolbar">
            <button
              type="button"
              className="button button-light"
              disabled={step <= 0}
              onClick={() => {
                setCursor(step - 1);
              }}
            >
              Предыдущая команда
            </button>
            <button
              type="button"
              className="button button-light"
              disabled={step >= program.length}
              onClick={() => {
                setCursor(step + 1);
              }}
            >
              Следующая команда
            </button>
          </div>
          <p role="status">
            Шаг {step}: {String(trace[step])}.{' '}
            {step > 0
              ? `Выполнена команда ${program[step - 1] ?? ''}.`
              : 'Исходное число.'}
          </p>
          <details>
            <summary>Полная трасса программы</summary>
            <ol>
              {trace.map((value, index) => (
                <li key={index}>
                  {index === 0
                    ? 'Начало'
                    : `Команда ${program[index - 1] ?? ''}`}
                  : {String(value)}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <button
        type="button"
        className="button button-dark"
        disabled={!!error || !program}
        onClick={() => {
          setChecked(true);
          setCursor(program.length);
        }}
      >
        Проверить программу
      </button>
      <p role="status">
        {checked && !error
          ? checkExecutor(problem, program)
            ? 'Верно: программа достигает цели и укладывается в пять команд.'
            : `Пока не подходит: получено ${String(trace.at(-1))}, цель — ${String(problem.end)}. Проверь порядок команд.`
          : ''}
      </p>
    </div>
  );
}
