import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  analyzeSignal,
  decoderPresets,
  encodeMessage,
  type DecoderPreset,
} from '../lib/interactives/decoder';

export default function CodeDecoder({ id, parameters }: InteractiveProps) {
  const initial = parameters.preset ?? 'prefix';
  if (
    initial !== 'prefix' &&
    initial !== 'nonprefix' &&
    initial !== 'ambiguous' &&
    initial !== 'signals'
  )
    throw new RangeError('Неизвестная таблица кодов.');
  const [preset, setPreset] = useState<DecoderPreset>(initial);
  const [codes, setCodes] = useState<readonly string[]>(
    decoderPresets[initial].codes,
  );
  const [signal, setSignal] = useState<string>(decoderPresets[initial].signal);
  const [path, setPath] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [revealed, setRevealed] = useState(false);
  const entries = codes.map((code, index) => ({
    letter: 'АБВГ'[index] ?? '',
    code,
  }));
  let analysis: ReturnType<typeof analyzeSignal> | undefined;
  let error = '';
  try {
    analysis = analyzeSignal(entries, signal);
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : 'Проверь таблицу и сигнал.';
  }
  const encoded = path.length ? encodeMessage(entries, path.join('')) : '';
  function restart() {
    setPath([]);
    setFeedback('');
    setRevealed(false);
  }
  return (
    <div className="information-lab">
      <p>
        Прочитай весь сигнал, выбирая коды букв. Если остался непрочитанный
        хвост, вернись к развилке. Совпадение короткого кода с началом длинного
        само по себе не делает сообщение неоднозначным.
      </p>
      <label htmlFor={`${id}-preset`}>Учебная таблица</label>
      <select
        id={`${id}-preset`}
        value={preset}
        onChange={(event) => {
          const value = event.target.value as DecoderPreset;
          setPreset(value);
          setCodes(decoderPresets[value].codes);
          setSignal(decoderPresets[value].signal);
          restart();
        }}
      >
        {Object.entries(decoderPresets).map(([value, item]) => (
          <option key={value} value={value}>
            {item.title}
          </option>
        ))}
      </select>
      <div className="decoder-table">
        {entries.map(({ letter, code }, index) => (
          <label key={letter} htmlFor={`${id}-code-${String(index)}`}>
            Код буквы {letter}
            <input
              id={`${id}-code-${String(index)}`}
              value={code}
              maxLength={5}
              onChange={(event) => {
                setCodes(
                  codes.map((item, position) =>
                    position === index ? event.target.value : item,
                  ),
                );
                restart();
              }}
            />
          </label>
        ))}
      </div>
      <label htmlFor={`${id}-signal`}>Сигнал</label>
      <input
        id={`${id}-signal`}
        value={signal}
        maxLength={64}
        onChange={(event) => {
          setSignal(event.target.value);
          restart();
        }}
      />
      {error && <p role="alert">{error}</p>}
      {analysis && (
        <>
          <p>
            {analysis.prefixFree
              ? 'Таблица префиксная: граница буквы определяется сразу.'
              : 'Таблица непрефиксная: проверяй продолжение каждой подходящей ветви.'}
          </p>
          <p className="decoder-signal">
            <span>
              Прочитано: <code>{encoded || '∅'}</code>
            </span>{' '}
            <span>
              Осталось: <code>{signal.slice(encoded.length) || '∅'}</code>
            </span>
          </p>
          <div className="interactive-toolbar">
            {entries.map(({ letter, code }) => (
              <button
                className="button button-light"
                type="button"
                key={letter}
                disabled={!signal.startsWith(code, encoded.length)}
                onClick={() => {
                  setPath([...path, letter]);
                  setFeedback('');
                }}
              >
                Добавить {letter} ({code})
              </button>
            ))}
            <button
              className="button button-light"
              type="button"
              disabled={!path.length}
              onClick={() => {
                setPath(path.slice(0, -1));
                setFeedback('');
              }}
            >
              Шаг назад
            </button>
            <button
              className="button button-light"
              type="button"
              onClick={restart}
            >
              Сначала
            </button>
          </div>
          <p role="status">
            Твоя расшифровка: {path.join('') || 'пока нет букв'}. Прочитано
            знаков: {encoded.length} из {signal.length}.
          </p>
          <div className="interactive-toolbar">
            <button
              className="button button-dark"
              type="button"
              onClick={() => {
                setFeedback(
                  encoded === signal
                    ? `Верно: сообщение прочитано целиком. Обратное кодирование: ${encoded}. ${analysis.count === 1n ? 'Это единственная расшифровка.' : `Сигнал неоднозначен. Число полных расшифровок: ${analysis.count.toString()}.`}`
                    : 'Разбор ещё не завершён. Если ни один код не подходит к остатку, нажми «Шаг назад» и проверь другую ветвь.',
                );
              }}
            >
              Проверить разбор
            </button>
            <button
              className="button button-light"
              type="button"
              aria-expanded={revealed}
              onClick={() => {
                setRevealed(!revealed);
              }}
            >
              Все расшифровки
            </button>
          </div>
          <p role="status">{feedback}</p>
          {revealed && (
            <div role="status">
              <p>
                Полных расшифровок: {analysis.count.toString()}.{' '}
                {analysis.count === 0n
                  ? 'Сигнал нельзя прочитать по этой таблице.'
                  : analysis.count === 1n
                    ? 'Это сообщение однозначно.'
                    : 'У сообщения несколько допустимых разборов.'}
              </p>
              <ul>
                {analysis.messages.map((message) => (
                  <li key={message}>
                    <code>{message}</code> →{' '}
                    <code>{encodeMessage(entries, message)}</code>
                  </li>
                ))}
              </ul>
              {analysis.count > 20n && <p>Показаны первые 20 расшифровок.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
