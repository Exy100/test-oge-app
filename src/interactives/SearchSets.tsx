import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  compareSearch,
  conditionalSearch,
  initialRegions,
  regionNames,
  searchGoals,
} from '../lib/interactives/search';
import SearchDiagram from '../components/lessons/SearchDiagram';
import { queryAnswer } from '../core/generators/exam/short-problems';
export default function SearchSets({ id, parameters }: InteractiveProps) {
  const initial = parameters.goal ?? 'conditional';
  if (
    initial !== 'union' &&
    initial !== 'intersection' &&
    initial !== 'conditional' &&
    initial !== 'triple' &&
    initial !== 'pair'
  )
    throw new RangeError('Неизвестная цель запроса.');
  const [goal, setGoal] = useState<keyof typeof searchGoals>(initial),
    [source, setSource] = useState('A'),
    [fields, setFields] = useState<string[]>(initialRegions.map(String)),
    [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false),
    [countChecked, setCountChecked] = useState(false);
  let result: ReturnType<typeof compareSearch> | undefined,
    exam: ReturnType<typeof conditionalSearch> | undefined,
    error = '';
  try {
    if (fields.some((value) => !/^\d{1,5}$/u.test(value)))
      throw new RangeError(
        'Количество страниц в каждой области — целое от 0 до 10000.',
      );
    const counts = fields.map(Number);
    result = compareSearch(source, searchGoals[goal].query, counts);
    exam = conditionalSearch(counts, goal === 'pair' ? 'pair' : 'triple');
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : 'Проверь запрос и количества.';
  }
  function edit(next: string) {
    setSource(next);
    setChecked(false);
    setCountChecked(false);
  }
  const targetTotal =
    exam && (goal === 'pair' || goal === 'triple')
      ? queryAnswer(exam)
      : result?.expected.total;
  return (
    <div className="information-lab">
      <p>
        A, B, C обозначают множества страниц с соответствующими словами. База
        неизменна. Круги показывают принадлежность, их площадь условная; числа в
        отдельных областях не пересекаются.
      </p>
      <label htmlFor={`${id}-goal`}>Цель поискового запроса</label>
      <select
        id={`${id}-goal`}
        value={goal}
        onChange={(event) => {
          setGoal(event.target.value as keyof typeof searchGoals);
          setChecked(false);
          setCountChecked(false);
        }}
      >
        {Object.entries(searchGoals).map(([key, item]) => (
          <option key={key} value={key}>
            {item.title}
          </option>
        ))}
      </select>
      <p>Цель: {searchGoals[goal].title}.</p>
      <label htmlFor={`${id}-source`}>Твой поисковый запрос</label>
      <input
        id={`${id}-source`}
        value={source}
        maxLength={160}
        spellCheck={false}
        onChange={(event) => {
          edit(event.target.value);
        }}
        aria-describedby={`${id}-grammar`}
      />
      <p id={`${id}-grammar`}>
        Используй A, B, C, И (&), ИЛИ (|), НЕ и скобки. Приоритет: скобки, НЕ,
        И, ИЛИ. НЕ — учебное дополнение относительно всех страниц этой базы; в
        примерах формата №8 используются & и |.
      </p>
      <div className="interactive-toolbar">
        {['A', 'B', 'C', ' & ', ' | ', 'НЕ ', '(', ')'].map((token) => (
          <button
            type="button"
            className="button button-light"
            key={token}
            onClick={() => {
              edit(source + token);
            }}
          >
            Добавить {token.trim()}
          </button>
        ))}
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            edit('');
          }}
        >
          Очистить запрос
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <SearchDiagram
            id={id}
            counts={fields.map(Number)}
            selected={result.actual.selected}
          />
          <p>
            Подчёркнутые числа и подсветка отмечают области твоего запроса. Он
            нашёл страниц: <strong>{result.actual.total}</strong>. Учтено:{' '}
            {regionNames
              .filter((_, mask) => result.actual.selected[mask])
              .join('; ') || 'ни одной области'}
            .
          </p>
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              setChecked(true);
            }}
          >
            Проверить запрос
          </button>
          <p role="status">
            {checked
              ? result.equivalent
                ? 'Верно: запрос совпадает с целью на всех восьми наборах слов.'
                : `Пока запрос отличается от цели: проверь набор «${regionNames[result.mismatch] ?? ''}». Сравнивается правило отбора, даже если эта область сейчас пустая.`
              : ''}
          </p>
        </>
      )}
      <div
        className="lab-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Количество страниц в непересекающихся областях"
      >
        <table>
          <caption>Измени базу: в каждой области от 0 до 10000 страниц</caption>
          <thead>
            <tr>
              <th scope="col">Область</th>
              <th scope="col">Страниц</th>
            </tr>
          </thead>
          <tbody>
            {regionNames.map((name, mask) => (
              <tr key={name} data-current={result?.actual.selected[mask]}>
                <th scope="row">{name}</th>
                <td>
                  <label
                    className="ui-sr-only"
                    htmlFor={`${id}-region-${String(mask)}`}
                  >
                    Страниц: {name}
                  </label>
                  <input
                    id={`${id}-region-${String(mask)}`}
                    inputMode="numeric"
                    maxLength={6}
                    value={fields[mask]}
                    onChange={(event) => {
                      setFields(
                        fields.map((value, index) =>
                          index === mask ? event.target.value : value,
                        ),
                      );
                      setChecked(false);
                      setCountChecked(false);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="button button-light"
        onClick={() => {
          setFields(initialRegions.map(String));
          setChecked(false);
          setCountChecked(false);
        }}
      >
        Вернуть исходную базу
      </button>
      {exam && (
        <div
          className="lab-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Таблица условного объединения"
        >
          <table>
            <caption>Связь с форматом №8: количества в страницах</caption>
            <thead>
              <tr>
                <th scope="col">Запрос</th>
                <th scope="col">Количество</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">A &amp; (B | C)</th>
                <td>{exam.union}</td>
              </tr>
              <tr>
                <th scope="row">A &amp; B</th>
                <td>{exam.left}</td>
              </tr>
              <tr>
                <th scope="row">{goal === 'pair' ? 'A & B & C' : 'A & C'}</th>
                <td>{goal === 'pair' ? exam.both : exam.right}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <label htmlFor={`${id}-answer`}>
        Сколько страниц найдёт целевой запрос?
      </label>
      <input
        id={`${id}-answer`}
        value={answer}
        maxLength={12}
        inputMode="numeric"
        onChange={(event) => {
          setAnswer(event.target.value);
          setCountChecked(false);
        }}
      />
      <button
        type="button"
        className="button button-dark"
        disabled={!result}
        onClick={() => {
          setCountChecked(true);
        }}
      >
        Проверить количество
      </button>
      <p role="status">
        {countChecked && result
          ? /^\d+$/u.test(answer.trim()) && Number(answer) === targetTotal
            ? 'Верно: количество страниц совпадает с целью.'
            : 'Пока неверно. Посчитай каждую выбранную область один раз; не складывай пересечение дважды.'
          : ''}
      </p>
    </div>
  );
}
