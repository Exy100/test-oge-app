import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { textVolume, removeListedWord } from '../lib/interactives/information';
import {
  bits as formatBits,
  bytes as formatBytes,
  quantity,
} from '../core/generators/task';

export default function TextVolume({ id, parameters }: InteractiveProps) {
  const words = ['дуб', 'клён', 'сосна', 'берёза'];
  const initial =
    typeof parameters.text === 'string' ? parameters.text : words.join(', ');
  const initialWidth =
    typeof parameters.width === 'number' ? parameters.width : 16;
  textVolume(initial, initialWidth);
  const [before, setBefore] = useState(initial);
  const [after, setAfter] = useState(initial);
  const [width, setWidth] = useState(initialWidth);
  const [word, setWord] = useState(1);
  const [prediction, setPrediction] = useState('');
  const [feedback, setFeedback] = useState('');
  let data:
    | {
        first: ReturnType<typeof textVolume>;
        second: ReturnType<typeof textVolume>;
        delta: number;
      }
    | undefined;
  let error = '';
  try {
    const first = textVolume(before, width),
      second = textVolume(after, width);
    data = { first, second, delta: second.bytes - first.bytes };
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь текст.';
  }
  function clearFeedback() {
    setFeedback('');
  }
  return (
    <div className="information-lab">
      <p>
        Условная кодировка: каждый знак занимает одинаковое число бит. Пробел и
        перенос строки тоже считаются. Это учебная модель, а не измерение файла
        в UTF-8.
      </p>
      <label htmlFor={`${id}-width`}>Бит на знак</label>
      <select
        id={`${id}-width`}
        value={width}
        onChange={(event) => {
          setWidth(Number(event.target.value));
          clearFeedback();
        }}
      >
        {[8, 16, 32].map((bits) => (
          <option key={bits} value={bits}>
            {bits}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-before`}>Текст до изменения</label>
      <textarea
        id={`${id}-before`}
        rows={2}
        maxLength={160}
        value={before}
        onChange={(event) => {
          setBefore(event.target.value);
          clearFeedback();
        }}
      />
      <label htmlFor={`${id}-after`}>Текст после изменения</label>
      <textarea
        id={`${id}-after`}
        rows={2}
        maxLength={160}
        value={after}
        onChange={(event) => {
          setAfter(event.target.value);
          clearFeedback();
        }}
      />
      <label htmlFor={`${id}-word`}>Слово для опыта со списком</label>
      <select
        id={`${id}-word`}
        value={word}
        onChange={(event) => {
          setWord(Number(event.target.value));
          clearFeedback();
        }}
      >
        {words.map((item, index) => (
          <option key={item} value={index}>
            {item}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button button-light"
        onClick={() => {
          setBefore(words.join(', '));
          setAfter(removeListedWord(words, word));
          clearFeedback();
        }}
      >
        Удалить слово вместе с разделителем
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <svg
            role="img"
            viewBox="0 0 340 110"
            aria-labelledby={`${id}-diagram`}
          >
            <title id={`${id}-diagram`}>
              Сравнение объёма: до {data.first.bytes} байт, после{' '}
              {data.second.bytes} байт
            </title>
            <text x="0" y="18" fill="currentColor">
              До: {quantity(data.first.characters, ['знак', 'знака', 'знаков'])}
            </text>
            <rect
              x="0"
              y="26"
              width={Math.max(
                0,
                (data.first.bytes /
                  Math.max(1, data.first.bytes, data.second.bytes)) *
                  330,
              )}
              height="16"
              fill="currentColor"
            />
            <text x="0" y="68" fill="currentColor">
              После:{' '}
              {quantity(data.second.characters, ['знак', 'знака', 'знаков'])}
            </text>
            <rect
              x="0"
              y="76"
              width={Math.max(
                0,
                (data.second.bytes /
                  Math.max(1, data.first.bytes, data.second.bytes)) *
                  330,
              )}
              height="16"
              fill="currentColor"
            />
          </svg>
          <p role="status">
            До: {quantity(data.first.characters, ['знак', 'знака', 'знаков'])},{' '}
            {formatBits(data.first.bits)}, {formatBytes(data.first.bytes)}.
            После:{' '}
            {quantity(data.second.characters, ['знак', 'знака', 'знаков'])},{' '}
            {formatBits(data.second.bits)}, {formatBytes(data.second.bytes)}.{' '}
            {data.delta === 0
              ? 'Объём не изменился.'
              : `Объём ${data.delta > 0 ? 'увеличился' : 'уменьшился'} на ${formatBytes(Math.abs(data.delta))}.`}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback(
                /^\d+$/u.test(prediction.trim()) &&
                  Number(prediction) === Math.abs(data.delta)
                  ? 'Верно. Разность числа знаков умножь на число бит на знак и раздели на 8.'
                  : 'Проверь разность длин, включая пробелы и запятые. Переведи полученные биты в байты.',
              );
            }}
          >
            <label htmlFor={`${id}-prediction`}>
              На сколько байт изменился объём?
            </label>
            <input
              id={`${id}-prediction`}
              inputMode="numeric"
              value={prediction}
              onChange={(event) => {
                setPrediction(event.target.value);
                clearFeedback();
              }}
            />
            <button className="button button-dark" type="submit">
              Проверить изменение
            </button>
          </form>
        </>
      )}
      <p role="status">{feedback}</p>
    </div>
  );
}
