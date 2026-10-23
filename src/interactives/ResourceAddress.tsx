import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  addressLabs,
  addressParts,
  assembleAddress,
} from '../lib/interactives/networks';
export default function ResourceAddress({ id, parameters }: InteractiveProps) {
  const initial = parameters.preset ?? 'https';
  if (initial !== 'https' && initial !== 'ftp' && initial !== 'overlap')
    throw new RangeError('Неизвестный набор фрагментов.');
  const [preset, setPreset] = useState<keyof typeof addressLabs>(initial),
    [sequence, setSequence] = useState(''),
    [checked, setChecked] = useState(false);
  const { problem } = addressLabs[preset],
    parts = addressParts(problem.target);
  let result: ReturnType<typeof assembleAddress> | undefined,
    error = '';
  try {
    result = assembleAddress(problem, sequence);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь метки.';
  }
  function edit(next: string) {
    setSequence(next);
    setChecked(false);
  }
  return (
    <div className="information-lab">
      <label htmlFor={`${id}-preset`}>Набор фрагментов URL</label>
      <select
        id={`${id}-preset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value as keyof typeof addressLabs);
          edit('');
        }}
      >
        {Object.entries(addressLabs).map(([key, lab]) => (
          <option key={key} value={key}>
            {lab.title}
          </option>
        ))}
      </select>
      <p>
        Собери адрес <code className="lab-address">{problem.target}</code>.
        Используй все семь фрагментов ровно по одному разу. Адрес показан как
        текст: переходить на сайт не требуется.
      </p>
      <svg
        role="img"
        viewBox="0 0 360 95"
        aria-labelledby={`${id}-parts-title`}
      >
        <title id={`${id}-parts-title`}>
          Порядок частей URL: схема, сервер, путь к файлу
        </title>
        <path
          d="M100 44 H126 M232 44 H257"
          stroke="currentColor"
          strokeWidth="2"
        />
        {[8, 126, 257].map((x, index) => (
          <rect
            key={x}
            x={x}
            y="15"
            width={index === 1 ? 106 : 95}
            height="57"
            rx="7"
            fill="none"
            stroke="currentColor"
          />
        ))}
        <text x="20" y="49" fill="currentColor">
          Схема
        </text>
        <text x="143" y="49" fill="currentColor">
          Сервер
        </text>
        <text x="278" y="49" fill="currentColor">
          Путь
        </text>
      </svg>
      <dl className="lab-address-parts">
        <dt>Схема (протокол)</dt>
        <dd>{parts.scheme}</dd>
        <dt>Сервер</dt>
        <dd>{parts.host}</dd>
        <dt>Путь</dt>
        <dd>{parts.path}</dd>
      </dl>
      <div className="interactive-toolbar">
        {problem.fragments.map((fragment, index) => (
          <button
            type="button"
            key={index}
            className="button button-light"
            disabled={
              sequence.includes(String(index + 1)) || sequence.length >= 7
            }
            onClick={() => {
              edit(sequence + String(index + 1));
            }}
          >
            {index + 1}: {fragment}
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-sequence`}>Последовательность меток 1–7</label>
      <input
        id={`${id}-sequence`}
        value={sequence}
        maxLength={32}
        inputMode="numeric"
        spellCheck={false}
        onChange={(event) => {
          edit(event.target.value);
        }}
        aria-describedby={`${id}-format`}
      />
      <p id={`${id}-format`}>
        Только цифры без разделителей. Фрагменты соединяются без добавления
        точек, двоеточий или слешей.
      </p>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            edit(sequence.slice(0, -1));
          }}
        >
          Убрать последний фрагмент
        </button>
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            edit('');
          }}
        >
          Очистить адрес
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          Собрано {sequence.length} из 7:{' '}
          <code className="lab-address">{result.address || 'пока пусто'}</code>
        </p>
      )}
      <button
        type="button"
        className="button button-dark"
        disabled={!result?.complete}
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить адрес
      </button>
      <p role="status">
        {checked && result
          ? result.correct
            ? 'Верно: все фрагменты использованы, адрес совпадает с целью.'
            : 'Пока адрес не совпал с целью. Проверь протокол, точки, слеши и порядок фрагментов.'
          : ''}
      </p>
    </div>
  );
}
