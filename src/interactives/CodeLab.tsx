import { quantity } from '../core/generators/task';
import { useMemo, useRef, useState } from 'react';
import { codeProblem, type CodeScenario } from '../lib/interactives/code-lab';
import { encodeMessage } from '../lib/interactives/decoder';
import {
  useInteractiveInterval,
  useInteractiveRuntime,
} from '../lib/interactives/hooks';
import { sitePath } from '../lib/site';
import '../styles/code-lab.css';

type Mode = 'guide' | 'together' | 'solo';
const scenarios = [
  { id: 'read', label: 'Читаем сообщение' },
  { id: 'branches', label: 'Проверяем развилки' },
  { id: 'repeats', label: 'Находим повторения' },
] as const;
const modes = [
  { id: 'guide', label: 'Разбор' },
  { id: 'together', label: 'Вместе' },
  { id: 'solo', label: 'Самостоятельно' },
] as const;
export default function CodeLab() {
  const [scenario, setScenario] = useState<CodeScenario>('read');
  const [variant, setVariant] = useState(0);
  const [mode, setMode] = useState<Mode>('together');
  const [flat, setFlat] = useState(false);
  return (
    <div className="code-lab">
      <div className="code-settings">
        <label>
          Что тренируем
          <select
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as CodeScenario);
              setVariant(0);
            }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-light"
          type="button"
          onClick={() => {
            setVariant(variant + 1);
          }}
        >
          ↻ Новый вариант <span>{variant + 1}</span>
        </button>
      </div>
      <CodeExercise
        key={`${scenario}:${String(variant)}:${mode}`}
        {...{ scenario, variant, mode, flat }}
        onMode={setMode}
        onFlat={() => {
          setFlat(!flat);
        }}
        onNew={() => {
          setVariant(variant + 1);
        }}
      />
    </div>
  );
}
function CodeExercise({
  scenario,
  variant,
  mode,
  flat,
  onMode,
  onFlat,
  onNew,
}: {
  scenario: CodeScenario;
  variant: number;
  mode: Mode;
  flat: boolean;
  onMode: (mode: Mode) => void;
  onFlat: () => void;
  onNew: () => void;
}) {
  const p = useMemo(() => codeProblem(scenario, variant), [scenario, variant]);
  const [path, setPath] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [choiceNotice, setChoiceNotice] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [hint, setHint] = useState(false);
  const [attempts, setAttempts] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [solved, setSolved] = useState(false);
  const scene = useRef<HTMLElement>(null);
  const runtime = useInteractiveRuntime(scene);
  const guide = mode === 'guide';
  const currentPath = guide ? (p.frames[frame]?.path ?? '') : path;
  const encoded = encodeMessage(p.entries, currentPath);
  const complete = encoded === p.signal;
  const dead =
    !complete &&
    !p.entries.some((e) => p.signal.startsWith(e.code, encoded.length));
  const finalFrame = frame === p.frames.length - 1;
  const showResult = solved || (guide && finalFrame);
  const chunks = Array.from(currentPath, (letter) => ({
    letter,
    code: p.entries.find((e) => e.letter === letter)?.code ?? '',
  }));
  const remaining = p.signal.slice(encoded.length);
  useInteractiveInterval(
    () => {
      if (frame < p.frames.length - 1) setFrame(frame + 1);
      if (frame >= p.frames.length - 2) setPlaying(false);
    },
    2300 / speed,
    {
      active: runtime.active && playing && guide,
      reducedMotion: runtime.reducedMotion,
    },
  );
  function reset() {
    setChoiceNotice('');
    setPreviewCode('');
    setPath('');
    setFrame(0);
    setPlaying(false);
    setFeedback('');
    setHint(false);
    setAttempts([]);
    setAnswer('');
    setSolved(false);
  }
  function back() {
    setChoiceNotice('Выбор отменён. Попробуй другую букву.');
    setPreviewCode('');
    setPlaying(false);
    setFeedback('');
    setAnswer('');
    setSolved(false);
    setHint(false);
    if (guide) setFrame(Math.max(0, frame - 1));
    else {
      if (dead) setAttempts([...new Set([...attempts, path])]);
      setPath(path.slice(0, -1));
    }
  }
  function choose(letter: string, code: string) {
    setFeedback('');
    setHint(false);
    if (!p.signal.startsWith(code, encoded.length)) {
      setPreviewCode(code);
      setChoiceNotice(
        `Код ${code} не совпадает с началом остатка «${remaining}». Попробуй другую букву.`,
      );
      setFeedback(
        'Этот код не совпадает с началом оставшегося сигнала. Сравни знаки по порядку.',
      );
      return;
    }
    const next = path + letter;
    setPreviewCode('');
    setChoiceNotice(
      `Добавлена буква ${letter}. Прочитано ${String(encoded.length + code.length)} из ${String(p.signal.length)} знаков.`,
    );
    setPath(next);
    setSolved(false);
    if (scenario !== 'repeats') setAnswer(next);
  }
  function check() {
    const normalized = answer.trim().toLocaleUpperCase('ru');
    if (!normalized) {
      setFeedback('Сначала запиши ответ.');
      return;
    }
    if (mode === 'together' && !complete) {
      setFeedback(
        'Сначала прочитай весь сигнал. Нельзя оставлять непрочитанный хвост.',
      );
      return;
    }
    if (normalized !== p.answer) {
      setFeedback(
        scenario === 'repeats'
          ? 'Проверь повторения в расшифрованном сообщении. Каждую повторяющуюся букву запиши один раз в алфавитном порядке.'
          : 'Ответ не совпал. Проверь границы кодов и используй сигнал целиком.',
      );
      return;
    }
    setSolved(true);
    setPath(p.message);
    setFeedback('Верно! Задача решена.');
  }
  const instruction =
    scenario === 'repeats'
      ? 'Выпишите буквы, которые встречаются в сообщении больше одного раза. Каждую букву запишите один раз, в алфавитном порядке, без пробелов.'
      : 'Расшифруйте сообщение. В ответе запишите последовательность букв без пробелов.';
  return (
    <>
      <section
        className="code-condition"
        aria-labelledby="code-condition-title"
      >
        <div className="code-condition-heading">
          <span className="code-kicker">ОГЭ · ЗАДАНИЕ №2</span>
          <h2 id="code-condition-title">Условие задания</h2>
          <span className="code-tag">Вариант {variant + 1}</span>
        </div>
        <div>
          <p>
            Сообщение закодировано по таблице. Коды букв записаны подряд, без
            разделителей. Известно, что сообщение расшифровывается единственным
            образом.
          </p>
          <table className="code-table">
            <caption className="ui-sr-only">Таблица кодов</caption>
            <tbody>
              <tr>
                <th scope="row">Буква</th>
                {p.entries.map((e) => (
                  <td key={e.letter}>{e.letter}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Код</th>
                {p.entries.map((e) => (
                  <td key={e.letter}>
                    <code>{e.code}</code>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="code-source">
            Передано: <code>{p.signal}</code>
          </p>
          <p>
            <strong>{instruction}</strong>
          </p>
          <p className="code-small">
            Сообщение — последовательность букв, не обязательно слово.
          </p>
        </div>
      </section>
      <a className="code-jump" href="#code-workspace">
        Перейти к решению ↓
      </a>
      <div className="code-modes" role="group" aria-label="Режим обучения">
        {modes.map((m) => (
          <button
            type="button"
            key={m.id}
            aria-pressed={mode === m.id}
            onClick={() => {
              onMode(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="code-mode-description">
        {guide
          ? 'Смотри разбор по шагам. Можно остановиться и вернуться назад.'
          : mode === 'together'
            ? 'Нажимай на карточки букв и проверяй оставшийся сигнал.'
            : 'Реши задачу без подсказок. Карточки можно использовать как черновик.'}
      </p>
      <div className="code-workspace" id="code-workspace">
        <section
          className="code-card code-dictionary"
          aria-labelledby="code-dictionary-title"
        >
          <span className="code-kicker">01 / ВЫБИРАЕМ КОД</span>
          <h2 id="code-dictionary-title">Карточки букв</h2>
          <p className="code-small">
            {guide
              ? 'Последняя выбранная буква выделена.'
              : 'Нажми на букву или перетащи её на ленту сигнала.'}
          </p>
          {!guide && (
            <div className="code-mini-state">
              <span>Осталось прочитать</span>
              <code>{remaining || 'Весь сигнал прочитан'}</code>
              <span>
                Собрано: <strong>{currentPath || 'пока нет букв'}</strong>
              </span>
            </div>
          )}
          <div className="code-choices">
            {p.entries.map((e) => (
              <button
                type="button"
                key={e.letter}
                aria-label={`Добавить ${e.letter}, код ${e.code}`}
                disabled={guide || complete || solved}
                draggable={!guide && !complete && !solved}
                onPointerEnter={() => {
                  if (!guide && !complete) setPreviewCode(e.code);
                }}
                onPointerLeave={() => {
                  setPreviewCode('');
                }}
                onFocus={() => {
                  if (!guide && !complete) setPreviewCode(e.code);
                }}
                onBlur={() => {
                  setPreviewCode('');
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', e.letter);
                  event.dataTransfer.effectAllowed = 'copy';
                  setPreviewCode(e.code);
                }}
                onDragEnd={() => {
                  setPreviewCode('');
                }}
                data-selected={currentPath.endsWith(e.letter)}
                data-hint={hint && p.signal.startsWith(e.code, encoded.length)}
                onClick={() => {
                  choose(e.letter, e.code);
                }}
              >
                <strong>{e.letter}</strong>
                <code>{e.code}</code>
              </button>
            ))}
          </div>
          {!guide && (
            <p className="code-choice-notice" role="status">
              {choiceNotice ||
                'Выбери первую букву. Следи, как меняется сигнал.'}
            </p>
          )}
          <p className="code-small">
            Одна плитка — один знак сигнала. Скоба объединяет код одной буквы.
          </p>
          <a href={sitePath('/materials/i2/decoding/')}>Вспомнить теорию →</a>
        </section>
        <section
          ref={scene}
          className="code-card code-stage"
          data-flat={flat}
          data-reduced={runtime.reducedMotion}
          aria-labelledby="code-stage-title"
        >
          <div className="code-stage-heading">
            <div>
              <span className="code-kicker">02 / ЧИТАЕМ СИГНАЛ</span>
              <h2 id="code-stage-title">Стол расшифровки</h2>
            </div>
            <button
              className="code-view"
              type="button"
              onClick={onFlat}
              aria-label={
                flat ? 'Включить объёмный вид' : 'Включить плоский вид'
              }
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path
                  d={
                    flat
                      ? 'M4 4h16v16H4Z'
                      : 'm12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5M12 12v10'
                  }
                />
              </svg>
              {flat ? 'Плоско' : 'Объём'}
            </button>
          </div>
          <div className="code-progress">
            <span>Прочитано знаков</span>
            <strong>
              {encoded.length} / {p.signal.length}
            </strong>
          </div>
          <div
            className="code-tape"
            role="region"
            onDragOver={(event) => {
              if (!guide && !complete && !solved) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (guide || complete || solved) return;
              const entry = p.entries.find(
                (e) => e.letter === event.dataTransfer.getData('text/plain'),
              );
              if (entry) choose(entry.letter, entry.code);
            }}
            aria-label={`Прочитано: ${encoded || 'ничего'}. Осталось: ${remaining || 'ничего'}.`}
          >
            {chunks.map((c, index) => (
              <div
                className="code-chunk"
                data-repeat={
                  scenario === 'repeats' &&
                  (showResult ? p.answer : answer).includes(c.letter)
                }
                key={`${String(index)}:${c.letter}`}
              >
                <div className="code-tiles">
                  {Array.from(c.code, (sign, i) => (
                    <span className="code-tile" key={i}>
                      {sign}
                    </span>
                  ))}
                </div>
                <span className="code-bracket" />
                <strong className="code-letter">{c.letter}</strong>
              </div>
            ))}
            {remaining && (
              <div className="code-unread">
                <div className="code-tiles">
                  {Array.from(remaining, (sign, i) => (
                    <span
                      className="code-tile"
                      data-preview={
                        i < previewCode.length
                          ? previewCode[i] === sign
                            ? 'match'
                            : 'mismatch'
                          : undefined
                      }
                      key={i}
                    >
                      {sign}
                    </span>
                  ))}
                </div>
                <span>Ещё не прочитано</span>
              </div>
            )}
          </div>
          <div className="code-message">
            <span>Твоя расшифровка</span>
            <strong>{currentPath || '…'}</strong>
          </div>
          <p className="code-explanation" role="status">
            {guide
              ? p.frames[frame]?.note
              : mode === 'solo'
                ? 'Используй таблицу и запиши ответ ниже.'
                : dead
                  ? `Остался сигнал «${remaining}», который не начинается ни с одного кода. Вернись на шаг назад и попробуй другой путь.`
                  : complete
                    ? scenario === 'repeats'
                      ? 'Сигнал прочитан. Теперь выбери повторяющиеся буквы ниже.'
                      : 'Сигнал прочитан полностью. Проверь ответ.'
                    : 'Сравни начало оставшегося сигнала с кодами карточек.'}
          </p>
          <div className="code-controls">
            <button
              type="button"
              onClick={back}
              disabled={guide ? frame === 0 : !path}
            >
              ← Шаг назад
            </button>
            {guide && (
              <>
                <button
                  type="button"
                  className="code-primary"
                  disabled={finalFrame || runtime.reducedMotion}
                  onClick={() => {
                    setPlaying(!playing);
                  }}
                >
                  {playing ? 'Пауза' : 'Воспроизвести'}
                </button>
                <button
                  type="button"
                  disabled={finalFrame}
                  onClick={() => {
                    setPlaying(false);
                    setFrame(frame + 1);
                  }}
                >
                  Следующий шаг →
                </button>
              </>
            )}
            {!guide && mode !== 'solo' && dead && (
              <button
                type="button"
                onClick={() => {
                  setAttempts([...new Set([...attempts, path])]);
                  let prefix = path.slice(0, -1);
                  while (
                    prefix &&
                    p.entries.filter((e) =>
                      p.signal.startsWith(
                        e.code,
                        encodeMessage(p.entries, prefix).length,
                      ),
                    ).length < 2
                  )
                    prefix = prefix.slice(0, -1);
                  setPath(prefix);
                  setAnswer(scenario === 'repeats' ? '' : prefix);
                  setFeedback('');
                  setHint(false);
                }}
              >
                К развилке
              </button>
            )}
            <button type="button" onClick={reset}>
              Сначала
            </button>
          </div>
          {guide && (
            <div className="code-play-options">
              <span>
                Шаг {frame + 1} из {p.frames.length}
              </span>
              <label>
                Скорость
                <select
                  value={speed}
                  onChange={(e) => {
                    setSpeed(Number(e.target.value));
                  }}
                >
                  <option value={0.75}>0,75×</option>
                  <option value={1}>1×</option>
                  <option value={1.5}>1,5×</option>
                </select>
              </label>
              {runtime.reducedMotion && (
                <span>Анимация отключена. Переходи по шагам.</span>
              )}
            </div>
          )}
          {mode === 'together' && !complete && (
            <button
              className="code-hint"
              type="button"
              onClick={() => {
                setHint(true);
              }}
            >
              Подсказка
            </button>
          )}
          {hint && (
            <p className="code-small">
              Выделены коды, совпадающие с началом остатка. Каждый из них нужно
              проверить до конца — совпадение ещё не гарантирует успех.
            </p>
          )}
          {(attempts.length > 0 ||
            (guide && p.frames.slice(0, frame + 1).some((f) => f.dead))) && (
            <details className="code-history">
              <summary>Исследованные тупики</summary>
              <ul>
                {(guide
                  ? p.frames
                      .slice(0, frame + 1)
                      .filter((f) => f.dead)
                      .map((f) => f.path)
                  : attempts
                ).map((a, i) => (
                  <li key={i}>
                    {a} → осталось «
                    {p.signal.slice(encodeMessage(p.entries, a).length)}»: нет
                    подходящего кода.
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
      <section
        className="code-card code-answer"
        aria-labelledby="code-answer-title"
      >
        <div>
          <span className="code-kicker">03 / ЗАПИСЫВАЕМ ОТВЕТ</span>
          <h2 id="code-answer-title">
            {scenario === 'repeats'
              ? 'Найди повторяющиеся буквы'
              : 'Проверь расшифровку'}
          </h2>
          <p>
            {scenario === 'repeats'
              ? 'Каждую повторяющуюся букву — один раз, в алфавитном порядке.'
              : 'Все буквы сообщения по порядку, без пробелов.'}
          </p>
        </div>
        <div>
          {scenario === 'repeats' && complete && (!guide || finalFrame) && (
            <div
              className="code-repeat-choices"
              role="group"
              aria-label="Буквы для ответа"
            >
              {[...new Set(currentPath)].sort().map((letter) => (
                <button
                  key={letter}
                  type="button"
                  disabled={guide || solved}
                  aria-pressed={
                    guide ? p.answer.includes(letter) : answer.includes(letter)
                  }
                  onClick={() => {
                    setAnswer(
                      answer.includes(letter)
                        ? answer.replaceAll(letter, '')
                        : [...Array.from(answer), letter].sort().join(''),
                    );
                  }}
                >
                  {letter}
                  <span>
                    {quantity(currentPath.split(letter).length - 1, [
                      'раз',
                      'раза',
                      'раз',
                    ])}
                  </span>
                </button>
              ))}
            </div>
          )}
          {guide ? (
            <p className="code-guide-answer">
              {finalFrame
                ? `Ответ: ${p.answer}`
                : 'Ответ появится в конце разбора.'}
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <label htmlFor="code-answer">Твой ответ</label>
              <div className="code-answer-row">
                <input
                  id="code-answer"
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value.toLocaleUpperCase('ru'));
                    setFeedback('');
                    setSolved(false);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  aria-describedby="code-feedback"
                />
                <button className="code-primary" type="submit">
                  Проверить
                </button>
              </div>
            </form>
          )}
          <p id="code-feedback" role="status">
            {feedback}
          </p>
        </div>
        {showResult && (
          <div className="code-success">
            <strong>Проверка обратным кодированием</strong>
            <p>
              {p.message} → <code>{encodeMessage(p.entries, p.message)}</code>
            </p>
            <p>
              Получился исходный сигнал целиком.{' '}
              {guide
                ? 'Единственность подтверждена разбором всех допустимых путей.'
                : 'В условии гарантирована единственная расшифровка.'}
            </p>
            <button type="button" className="code-primary" onClick={onNew}>
              Следующий вариант →
            </button>
          </div>
        )}
      </section>
    </>
  );
}
