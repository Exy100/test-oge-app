import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { parameterInterval } from '../core/generators/exam/short-problems';
import {
  parameterLab,
  programTitles,
  traceProgram,
  type ProgramKind,
} from '../lib/interactives/programs';

export default function ProgramTracer({ id, parameters }: InteractiveProps) {
  const initial = parameters.program ?? 'assign';
  if (
    initial !== 'assign' &&
    initial !== 'branch' &&
    initial !== 'for' &&
    initial !== 'while'
  )
    throw new RangeError('Неизвестная программа.');
  const [kind, setKind] = useState<ProgramKind>(initial);
  const [input, setInput] = useState('6 2'),
    [n, setN] = useState('6'),
    [a, setA] = useState('2'),
    [pair, setPair] = useState(0);
  const [cursor, setCursor] = useState(-1),
    [prediction, setPrediction] = useState(''),
    [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<'min' | 'max' | 'any'>('min'),
    [parameterChecked, setParameterChecked] = useState(false);
  let trace: ReturnType<typeof traceProgram> | undefined,
    error = '';
  const validA = /^-?\d{1,4}$/u.test(a) && Math.abs(Number(a)) <= 1000;
  try {
    const raw = kind === 'assign' ? input.trim() : n.trim();
    if (kind !== 'branch' && !/^-?\d+(?:\s+-?\d+)*$/u.test(raw))
      throw new RangeError('Введи целые числа через пробел.');
    if (kind === 'branch' && !validA)
      throw new RangeError('Параметр A — целое от −1000 до 1000.');
    trace = traceProgram(
      kind,
      kind === 'branch'
        ? (parameterLab.pairs[pair] ?? [])
        : raw.split(/\s+/u).map(Number),
      kind === 'branch' ? Number(a) : 2,
    );
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь ввод.';
  }
  function reset() {
    setCursor(-1);
    setPrediction('');
    setChecked(false);
    setParameterChecked(false);
  }
  const current = trace?.steps[Math.min(cursor, trace.steps.length - 1)];
  const runs =
    kind === 'branch' && validA
      ? parameterLab.pairs.map(
          (values) => traceProgram('branch', values, Number(a)).output,
        )
      : [];
  const yes = runs.filter((value) => value === 'YES').length;
  const interval = parameterInterval({ ...parameterLab, mode });
  const parameterCorrect =
    yes === parameterLab.yes &&
    (mode === 'any' || Number(a) === interval[mode]);
  return (
    <div className="information-lab">
      <label htmlFor={`${id}-kind`}>Программа для трассировки</label>
      <select
        id={`${id}-kind`}
        value={kind}
        onChange={(event) => {
          setKind(event.target.value as ProgramKind);
          reset();
        }}
      >
        {Object.entries(programTitles).map(([key, title]) => (
          <option key={key} value={key}>
            {title}
          </option>
        ))}
      </select>
      <p>
        {kind === 'branch'
          ? 'Формат №6: в исходном условии вместо выбранного числа стоит параметр A. Девять запусков независимы. or означает ИЛИ.'
          : 'Подготовительное упражнение к чтению программ. В проверенных демоверсиях №6 требуется поиск параметра по девяти запускам.'}
      </p>
      {kind === 'assign' ? (
        <>
          <label htmlFor={`${id}-input`}>Ввод: x и y через пробел</label>
          <input
            id={`${id}-input`}
            value={input}
            maxLength={32}
            onChange={(event) => {
              setInput(event.target.value);
              reset();
            }}
          />
        </>
      ) : kind === 'branch' ? (
        <>
          <label htmlFor={`${id}-a`}>Параметр A</label>
          <input
            id={`${id}-a`}
            value={a}
            maxLength={8}
            inputMode="numeric"
            onChange={(event) => {
              setA(event.target.value);
              reset();
            }}
          />
          <label htmlFor={`${id}-pair`}>Запуск для пошагового просмотра</label>
          <select
            id={`${id}-pair`}
            value={pair}
            onChange={(event) => {
              setPair(Number(event.target.value));
              reset();
            }}
          >
            {parameterLab.pairs.map(([s, t], index) => (
              <option key={index} value={index}>
                {index + 1}: s={s}, t={t}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor={`${id}-n`}>Ввод: n</label>
          <input
            id={`${id}-n`}
            value={n}
            maxLength={8}
            inputMode="numeric"
            onChange={(event) => {
              setN(event.target.value);
              reset();
            }}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {trace && (
        <>
          <div
            className="lab-table-scroll program-code-frame"
            tabIndex={0}
            role="region"
            aria-label={`Код Python: ${programTitles[kind]}`}
          >
            <ol className="program-code" aria-label="Строки программы">
              {trace.lines.map((line, index) => (
                <li
                  key={index}
                  data-current={current?.line === index + 1}
                  aria-current={
                    current?.line === index + 1 ? 'step' : undefined
                  }
                >
                  <code>{line}</code>
                </li>
              ))}
            </ol>
          </div>
          <label htmlFor={`${id}-prediction`}>Какой будет вывод?</label>
          <input
            id={`${id}-prediction`}
            value={prediction}
            maxLength={24}
            onChange={(event) => {
              setPrediction(event.target.value);
              setChecked(false);
            }}
          />
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              setChecked(true);
            }}
          >
            Проверить прогноз
          </button>
          <p role="status">
            {checked
              ? prediction.trim() === trace.output
                ? 'Верно: прогноз совпадает с выводом.'
                : 'Пока неверно. Пройди строки и проверь новые значения переменных.'
              : ''}
          </p>
          <div className="interactive-toolbar">
            <button
              type="button"
              className="button button-light"
              disabled={cursor < 0}
              onClick={() => {
                setCursor(cursor - 1);
              }}
            >
              Предыдущий шаг программы
            </button>
            <button
              type="button"
              className="button button-light"
              disabled={cursor >= trace.steps.length - 1}
              onClick={() => {
                setCursor(cursor + 1);
              }}
            >
              Следующий шаг программы
            </button>
            <button
              type="button"
              className="button button-light"
              onClick={() => {
                setCursor(-1);
              }}
            >
              Сначала
            </button>
          </div>
          <p role="status">
            {current
              ? `Шаг ${String(cursor + 1)}. Строка ${String(current.line)}. ${current.action}. ${Object.entries(
                  current.values,
                )
                  .map(([name, value]) => `${name} = ${String(value)}`)
                  .join(
                    '; ',
                  )}. ${current.output ? `Вывод: ${current.output}.` : 'Вывода ещё нет.'}`
              : 'Программа ещё не запущена. Значения переменных не заданы.'}
          </p>
          <div
            className="lab-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Переменные после текущего шага"
          >
            <table>
              <caption>Состояние после выполненной строки</caption>
              <thead>
                <tr>
                  <th scope="col">Переменная</th>
                  <th scope="col">Значение</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(current?.values ?? {}).map(([name, value]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{value}</td>
                  </tr>
                ))}
                {!current && (
                  <tr>
                    <td colSpan={2}>Ввод ещё не выполнен</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {kind === 'branch' && validA && (
        <>
          <div
            className="lab-table-scroll lab-table-wide"
            tabIndex={0}
            role="region"
            aria-label="Девять независимых запусков"
          >
            <table>
              <caption>
                При A = {a}: YES — {yes}, NO — {9 - yes}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Запуск</th>
                  <th scope="col">s</th>
                  <th scope="col">t</th>
                  <th scope="col">Вывод</th>
                </tr>
              </thead>
              <tbody>
                {parameterLab.pairs.map(([s, t], index) => (
                  <tr key={index} data-current={pair === index}>
                    <th scope="row">{index + 1}</th>
                    <td>{s}</td>
                    <td>{t}</td>
                    <td>{runs[index]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label htmlFor={`${id}-mode`}>Какой параметр требуется?</label>
          <select
            id={`${id}-mode`}
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              setParameterChecked(false);
            }}
          >
            <option value="min">Наименьший</option>
            <option value="max">Наибольший</option>
            <option value="any">Любой подходящий</option>
          </select>
          <p>
            Подбери целое A, чтобы YES было ровно {parameterLab.yes} раз. Для
            минимума и максимума проверь соседнее целое.
          </p>
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              setParameterChecked(true);
            }}
          >
            Проверить параметр
          </button>
          <p role="status">
            {parameterChecked
              ? parameterCorrect
                ? 'Верно: параметр удовлетворяет числу YES и требованию вопроса.'
                : yes !== parameterLab.yes
                  ? `Пока не подходит: YES получилось ${String(yes)}, требуется ${String(parameterLab.yes)}.`
                  : 'Число YES верно, но проверь требование минимума или максимума и соседнее целое.'
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
