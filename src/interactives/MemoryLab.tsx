import { memo, useMemo, useRef, useState, useTransition } from 'react';
import { bytes as formatBytes, quantity } from '../core/generators/task';
import {
  useInteractiveInterval,
  useInteractiveRuntime,
} from '../lib/interactives/hooks';
import {
  checkMemoryAnswer,
  memoryProblem,
  memoryTokens,
  type MemoryProblem,
} from '../lib/interactives/memory-lab';
import { sitePath } from '../lib/site';
import '../styles/memory-lab.css';
import SymbolPractice from './SymbolPractice';
import { type SymbolScenario } from '../lib/interactives/symbol-examples';

// Set dynamic geometry through the CSSOM so static HTML contains no inline
// style attributes forbidden by the site's Content Security Policy.
function sceneStyle(values: Record<string, string>) {
  return (element: HTMLDivElement | null) => {
    if (!element) return;
    for (const [name, value] of Object.entries(values))
      element.style.setProperty(name, value);
    element.dataset.positioned = 'true';
  };
}

type Mode = 'guide' | 'together' | 'solo';
const modes: { id: Mode; label: string; description: string }[] = [
  {
    id: 'guide',
    label: 'Разбор',
    description: 'Смотри, как каждый шаг меняет представление текста в памяти.',
  },
  {
    id: 'together',
    label: 'Вместе',
    description: 'Рассчитай каждый шаг. Сцена поможет увидеть, что происходит.',
  },
  {
    id: 'solo',
    label: 'Самостоятельно',
    description:
      'Найди слово без подсказок. После ответа проверим его на сцене.',
  },
];
const stepNames = [
  'Размер символа',
  'Сколько символов?',
  'Учитываем разделители',
  'Находим слово',
  'Проверяем удаление',
];
const questions = [
  'Сколько байт занимает один символ?',
  'Сколько всего символов удалили?',
  'Сколько букв в удалённом слове?',
  'Какое слово удалили?',
];

function Icon({
  name,
}: {
  name:
    | 'play'
    | 'pause'
    | 'back'
    | 'next'
    | 'replay'
    | 'layers'
    | 'plane'
    | 'arrow'
    | 'check';
}) {
  const paths = {
    play: 'm9 5 11 7-11 7Z',
    pause: 'M9 5v14M15 5v14',
    back: 'm14 6-6 6 6 6',
    next: 'm10 6 6 6-6 6',
    replay: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
    layers: 'm12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5',
    plane:
      'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function formulas(p: MemoryProblem) {
  return [
    `${String(p.bits)} ÷ 8 = ${formatBytes(p.bytesPerSymbol)}`,
    `${String(p.bytes)} ÷ ${String(p.bytesPerSymbol)} = ${String(p.symbols)}`,
    `${String(p.symbols)} − 2 = ${quantity(p.letters, ['буква', 'буквы', 'букв'])}`,
    p.word,
    `(${String(p.letters)} + 2) × ${String(p.bytesPerSymbol)} = ${formatBytes(p.bytes)}`,
  ];
}

function position(p: MemoryProblem, index: number, phase: number) {
  const group = Math.floor(index / p.bytesPerSymbol);
  const layer = index % p.bytesPerSymbol;
  if (phase === 0) {
    const columns = Math.min(p.bytes, 9);
    return {
      x: 10 + (index % columns) * (80 / Math.max(columns - 1, 1)),
      y: 30 + Math.floor(index / columns) * 26,
    };
  }
  return {
    x: 10 + group * (80 / (p.symbols - 1)),
    y: 58 - layer * 9 + (phase >= 2 && group >= p.letters ? 14 : 0),
  };
}

function MemoryScene({
  problem: p,
  phase,
  replay,
  flat,
}: {
  problem: MemoryProblem;
  phase: number;
  replay: number;
  flat: boolean;
}) {
  const labels = [...Array.from(p.word), ',', '␣'];
  return (
    <div
      className="memory-scene"
      data-phase={phase}
      data-flat={flat}
      key={replay}
      aria-hidden="true"
    >
      <div className="memory-scene-grid" />
      {Array.from({ length: p.bytes }, (_, index) => {
        const to = position(p, index, phase);
        const from = position(p, index, Math.max(0, phase - 1));
        const group = Math.floor(index / p.bytesPerSymbol);
        return (
          <div
            key={index}
            className="memory-byte"
            data-separator={phase >= 2 && group >= p.letters}
            ref={sceneStyle({
              '--x': `${String(to.x)}%`,
              '--y': `${String(to.y)}%`,
              '--offset-x': `${String(from.x - to.x)}cqw`,
              '--offset-y': `${String(from.y - to.y)}cqw`,
              '--delay': `${String(index * 18)}ms`,
              '--piece-size': `${String(Math.min(7.8, 63 / p.symbols))}cqw`,
              'z-index': String(index + 1),
            })}
          >
            <span className="memory-byte-face">
              <span className="memory-bit-grid">
                {Array.from({ length: 8 }, (_, bit) => (
                  <i key={bit} />
                ))}
              </span>
            </span>
          </div>
        );
      })}
      {phase > 0 &&
        labels.map((letter, index) => (
          <div
            className="memory-symbol"
            data-separator={phase >= 2 && index >= p.letters}
            data-revealed={phase >= 3}
            key={index}
            ref={sceneStyle({
              left: `${String(10 + index * (80 / (p.symbols - 1)))}%`,
              top: `${String(26 + (phase >= 2 && index >= p.letters ? 14 : 0))}%`,
              '--piece-size': `${String(Math.min(8, 65 / p.symbols))}cqw`,
            })}
          >
            {phase >= 3
              ? letter
              : phase >= 2 && index >= p.letters
                ? letter
                : '?'}
          </div>
        ))}
      {phase === 0 ? (
        <span className="memory-scene-label">Каждая пластинка — 1 байт</span>
      ) : (
        <div className="memory-group-captions">
          {phase >= 2 ? (
            <>
              <span>{quantity(p.letters, ['буква', 'буквы', 'букв'])}</span>
              <span>Запятая + пробел</span>
            </>
          ) : (
            <span>
              {quantity(p.symbols, ['символ', 'символа', 'символов'])} · по{' '}
              {formatBytes(p.bytesPerSymbol)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const StableMemoryScene = memo(MemoryScene);

function Microscope({ width }: { width: number }) {
  const [bits, setBits] = useState(width);
  return (
    <details className="memory-microscope">
      <summary>
        <Icon name="layers" /> Почему символ занимает столько памяти?{' '}
        <span aria-hidden="true">+</span>
      </summary>
      <div className="memory-microscope-body">
        <p>
          Посмотри на один символ под лупой. Каждая группа из восьми ячеек —
          один байт.
        </p>
        <div
          className="memory-widths"
          role="group"
          aria-label="Бит на символ в учебном опыте"
        >
          {[8, 16, 32].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={bits === value}
              onClick={() => {
                setBits(value);
              }}
            >
              {value} бит
            </button>
          ))}
        </div>
        <div
          className="memory-micro-layers"
          aria-label={`${String(bits)} бит: ${formatBytes(bits / 8)}`}
        >
          {Array.from({ length: bits / 8 }, (_, index) => (
            <div key={index} className="memory-micro-byte">
              <span aria-hidden="true">
                {Array.from({ length: 8 }, (_, bit) => (
                  <i key={bit} />
                ))}
              </span>
              <small>1 байт</small>
            </div>
          ))}
        </div>
        <strong>
          {bits} ÷ 8 = {formatBytes(bits / 8)}
        </strong>
        <p className="memory-note">
          Это отдельный опыт. В текущей задаче по-прежнему {width} бит на
          символ.
        </p>
      </div>
    </details>
  );
}

function ProblemSession({
  variant,
  initialMode,
  onNew,
}: {
  variant: number;
  initialMode: Mode;
  onNew: (mode: Mode) => void;
}) {
  const p = useMemo(() => memoryProblem(variant), [variant]);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    message: string;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [flat, setFlat] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const runtime = useInteractiveRuntime(target);
  const solution = formulas(p);
  const done = step === 4;
  const soloHidden = mode === 'solo' && !done;
  const phase = soloHidden
    ? 0
    : mode === 'together' && !done
      ? Math.max(0, step - 1)
      : step;
  const currentQuestion = mode === 'solo' ? 3 : step;
  const canAdvance = mode === 'guide' || step < unlocked;
  const moving = runtime.active && !runtime.reducedMotion;

  function go(next: number) {
    setPaused(false);
    setStep(next);
    setAnswer('');
    setFeedback(null);
  }
  function changeMode(next: Mode) {
    setMode(next);
    setPlaying(false);
    setUnlocked(0);
    go(0);
  }
  useInteractiveInterval(
    () => {
      if (step >= 3) {
        go(4);
        setPlaying(false);
      } else go(step + 1);
    },
    2600 / speed,
    {
      active: moving && playing && mode === 'guide',
      reducedMotion: runtime.reducedMotion,
    },
  );

  function submit() {
    const result = checkMemoryAnswer(p, currentQuestion, answer);
    setFeedback(result);
    if (result.correct) {
      const next = mode === 'solo' ? 4 : step + 1;
      setUnlocked(Math.max(unlocked, next));
      setStep(next);
      setAnswer('');
      if (next < 4) input.current?.focus();
    }
  }

  const sceneDescription =
    phase === 0
      ? `${formatBytes(p.bytes)}. Каждая пластинка обозначает один байт.`
      : phase === 1
        ? `${quantity(p.symbols, ['символ', 'символа', 'символов'])}, каждый занимает ${formatBytes(p.bytesPerSymbol)}.`
        : phase === 2
          ? `Два символа — запятая и пробел. На слово остаётся ${quantity(p.letters, ['буква', 'буквы', 'букв'])}.`
          : `Слово «${p.word}», запятая и пробел занимают ${formatBytes(p.bytes)}.`;

  return (
    <div
      className="memory-lab"
      aria-busy={pending}
      data-mode={mode}
      data-step={step}
      data-motion={moving && !paused}
      data-reduced={runtime.reducedMotion}
      data-playing={playing}
      ref={sceneStyle({
        '--memory-motion': `${String(780 / speed)}ms`,
        '--memory-remove-duration': `${String(1700 / speed)}ms`,
      })}
    >
      <section
        className="memory-full-condition"
        aria-labelledby="memory-full-condition-title"
      >
        <div className="memory-full-condition-heading">
          <span className="memory-kicker">ОГЭ / ЗАДАНИЕ №1</span>
          <h2 id="memory-full-condition-title">Условие задания</h2>
          <span className="memory-full-condition-variant">
            Вариант {variant + 1}
          </span>
        </div>
        <div className="memory-full-condition-body">
          <p>
            В некоторой кодировке каждый символ кодируется {p.bits} битами.
            Ученик написал текст:
          </p>
          <blockquote>{p.before}</blockquote>
          <p>
            Ученик удалил из списка одно слово, а также лишние запятую и пробел
            — два пробела подряд идти не должны. При этом размер нового текста в
            данной кодировке оказался на <strong>{formatBytes(p.bytes)}</strong>{' '}
            меньше, чем размер исходного текста.
          </p>
          <p className="memory-full-condition-question">
            Напишите удалённое слово.
          </p>
        </div>
      </section>
      <div className="memory-topbar">
        <div className="memory-modes" role="group" aria-label="Режим обучения">
          {modes.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={mode === item.id}
              onClick={() => {
                changeMode(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="memory-new"
          onClick={() => {
            onNew(mode);
          }}
        >
          <Icon name="replay" /> Новый вариант{' '}
          <span>{String(variant + 1).padStart(2, '0')}</span>
        </button>
      </div>
      <p className="memory-mode-description">
        {modes.find((item) => item.id === mode)?.description}
      </p>
      <div className="memory-workspace">
        <aside
          className="memory-problem"
          aria-labelledby="memory-condition-title"
        >
          <div className="memory-card-heading">
            <span className="memory-kicker">01 / УСЛОВИЕ</span>
            <span className="memory-task-badge">№ 1</span>
          </div>
          <h2 id="memory-condition-title">
            Какое слово <br />
            исчезло?
          </h2>
          <p className="memory-source">{p.before}</p>
          <dl className="memory-facts">
            <div>
              <dt>Размер символа</dt>
              <dd>
                {p.bits} <span>бит</span>
              </dd>
            </div>
            <div>
              <dt>Текст стал меньше на</dt>
              <dd>
                {p.bytes} <span>байт</span>
              </dd>
            </div>
          </dl>
          <div className="memory-condition-note">
            <Icon name="layers" />
            <p>
              Удалили одно слово, а вместе с ним — лишние запятую и пробел.
              Двойных пробелов не осталось.
            </p>
          </div>
          <p className="memory-note">
            Каждый символ занимает одинаковое число бит.
          </p>
          <div className="memory-legend" aria-label="Обозначения на сцене">
            <h3>Обозначения на сцене</h3>
            <div>
              <span className="memory-legend-letter" aria-hidden="true">
                а
              </span>
              <p>
                <strong>Плитка с буквой</strong>
                <span>Обозначает символ. Это не дополнительный байт.</span>
              </p>
            </div>
            <div>
              <span className="memory-legend-byte" aria-hidden="true">
                {Array.from({ length: 8 }, (_, bit) => (
                  <i key={bit} />
                ))}
              </span>
              <p>
                <strong>1 пластинка = 1 байт</strong>
                <span>Восемь ячеек внутри — 8 бит.</span>
              </p>
            </div>
            {(mode === 'guide' || step > 0) && (
              <div>
                <span className="memory-legend-stack" aria-hidden="true">
                  {Array.from({ length: p.bytesPerSymbol }, (_, layer) => (
                    <i key={layer} />
                  ))}
                </span>
                <p>
                  <strong>
                    {quantity(p.bytesPerSymbol, [
                      'пластинка',
                      'пластинки',
                      'пластинок',
                    ])}{' '}
                    = {formatBytes(p.bytesPerSymbol)}
                  </strong>
                  <span>
                    Столько памяти занимает каждый символ в этой задаче, включая
                    запятую и пробел.
                  </span>
                </p>
              </div>
            )}
          </div>
          <a
            className="memory-theory-link"
            href={sitePath('/materials/i1/text-encoding/')}
          >
            Вспомнить теорию <Icon name="arrow" />
          </a>
        </aside>

        <section className="memory-center" aria-labelledby="memory-stage-title">
          <div ref={target} className="memory-stage-card">
            <div className="memory-stage-heading">
              <div>
                <span className="memory-kicker">02 / ИССЛЕДУЕМ</span>
                <h2 id="memory-stage-title">Текст в памяти</h2>
              </div>
              <button
                className="memory-view"
                type="button"
                aria-pressed={flat}
                onClick={() => {
                  setFlat(!flat);
                }}
                title={flat ? 'Включить объёмный вид' : 'Включить плоский вид'}
              >
                {flat ? 'Плоско' : 'Объём'}
                <Icon name={flat ? 'plane' : 'layers'} />
              </button>
            </div>
            <div className="memory-stage-subtitle">
              <span className="memory-live-dot" />
              {soloHidden
                ? 'Известно только изменение объёма'
                : stepNames[step]}
              <span>{formatBytes(p.bytes)}</span>
            </div>
            <StableMemoryScene
              problem={p}
              phase={phase}
              replay={replay}
              flat={flat}
            />
            <p className="memory-scene-description">{sceneDescription}</p>
            <div
              className="memory-equation"
              data-success={done}
              aria-live="polite"
            >
              {soloHidden ? (
                <>
                  <span>Твоя задача</span>
                  <strong>Найти удалённое слово</strong>
                </>
              ) : mode === 'together' && !done ? (
                <>
                  <span>{step === 0 ? 'Дано' : 'Уже знаем'}</span>
                  <strong>
                    {step === 0
                      ? `${String(p.bits)} бит на символ`
                      : solution[step - 1]}
                  </strong>
                </>
              ) : (
                <>
                  <span>
                    {done ? 'Всё сходится' : `Шаг ${String(step + 1)} из 5`}
                  </span>
                  <strong>{solution[step]}</strong>
                  {done && <Icon name="check" />}
                </>
              )}
            </div>
            {done && (
              <div className="memory-verification" key={replay}>
                <span className="memory-kicker">
                  УДАЛЯЕМ ИЗ ИСХОДНОЙ СТРОКИ
                </span>
                <p
                  className="memory-live-string"
                  aria-label={`После удаления: ${p.after}`}
                >
                  <span aria-hidden="true">
                    {memoryTokens(p).map((token, index) => (
                      <span
                        key={index}
                        className={
                          token.removed ? 'memory-removed-token' : undefined
                        }
                      >
                        {token.character === ' ' ? '\u00a0' : token.character}
                      </span>
                    ))}
                  </span>
                </p>
                <p>
                  {formatBytes(p.bytes)} освободилось ·{' '}
                  {quantity(p.symbols, ['символ', 'символа', 'символов'])}{' '}
                  удалено
                </p>
              </div>
            )}
          </div>

          <div className="memory-controls" aria-label="Управление решением">
            <button
              type="button"
              className="memory-icon-button"
              aria-label="Предыдущий шаг"
              aria-disabled={pending || undefined}
              disabled={step === 0 || mode === 'solo'}
              onClick={() => {
                setPlaying(false);
                if (!pending)
                  startTransition(() => {
                    go(step - 1);
                  });
              }}
            >
              <Icon name="back" />
            </button>
            {mode === 'guide' ? (
              <button
                type="button"
                className="memory-play"
                disabled={runtime.reducedMotion}
                onClick={() => {
                  if (done) go(0);
                  setPaused(playing);
                  setPlaying(!playing);
                }}
              >
                <Icon name={playing ? 'pause' : 'play'} />
                {playing
                  ? 'Пауза'
                  : done
                    ? 'Посмотреть ещё раз'
                    : 'Воспроизвести'}
              </button>
            ) : (
              <button
                type="button"
                className="memory-repeat"
                onClick={() => {
                  setPaused(false);
                  setReplay(replay + 1);
                }}
              >
                <Icon name="replay" /> Повторить движение
              </button>
            )}
            <button
              type="button"
              className="memory-icon-button"
              aria-label="Следующий шаг"
              aria-disabled={pending || undefined}
              disabled={done || !canAdvance || mode === 'solo'}
              onClick={() => {
                setPlaying(false);
                if (!pending)
                  startTransition(() => {
                    go(step + 1);
                  });
              }}
            >
              <Icon name="next" />
            </button>
            <label className="memory-speed">
              Скорость
              <select
                aria-label="Скорость анимации"
                value={speed}
                onChange={(event) => {
                  setSpeed(Number(event.target.value));
                }}
              >
                <option value={0.5}>0,5×</option>
                <option value={1}>1×</option>
                <option value={1.5}>1,5×</option>
              </select>
            </label>
          </div>
          <div
            className="memory-progress"
            role="group"
            aria-label="Перейти к шагу"
          >
            {stepNames.map((name, index) => (
              <button
                type="button"
                key={name}
                aria-label={`Шаг ${String(index + 1)}: ${name}`}
                aria-current={step === index ? 'step' : undefined}
                data-complete={index < step}
                aria-disabled={pending || undefined}
                disabled={
                  mode === 'solo' || (mode === 'together' && index > unlocked)
                }
                onClick={() => {
                  setPlaying(false);
                  if (!pending)
                    startTransition(() => {
                      go(index);
                    });
                }}
              >
                <span />
              </button>
            ))}
          </div>
          {runtime.reducedMotion && (
            <p className="memory-motion-note">
              Движение отключено в настройках. Все шаги доступны кнопками.
            </p>
          )}
          <Microscope width={p.bits} />
        </section>

        <aside
          className="memory-solution"
          aria-labelledby="memory-solution-title"
        >
          <span className="memory-kicker">03 / РЕШАЕМ</span>
          <h2 id="memory-solution-title">
            {mode === 'solo' && !done ? 'Твой ответ' : 'Шаг за шагом'}
          </h2>
          {!soloHidden && (
            <ol className="memory-steps">
              {stepNames.map((name, index) => {
                const revealed =
                  index < step || (mode === 'guide' && index === step) || done;
                return (
                  <li
                    key={name}
                    data-current={index === step}
                    data-complete={index < step}
                  >
                    <span className="memory-step-number">
                      {index < step ? <Icon name="check" /> : index + 1}
                    </span>
                    <div>
                      <strong>{name}</strong>
                      {revealed ? (
                        <p>{solution[index]}</p>
                      ) : (
                        <p className="memory-step-pending">
                          {index === step
                            ? 'Теперь твоя очередь'
                            : 'Следующий шаг'}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {mode !== 'guide' && !done && (
            <form
              className="memory-answer"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label htmlFor="memory-answer">
                {questions[currentQuestion]}
              </label>
              {currentQuestion === 3 && (
                <div className="memory-word-choices">
                  {p.words.map((word) => (
                    <button
                      type="button"
                      key={word}
                      aria-pressed={answer === word}
                      onClick={() => {
                        setAnswer(word);
                        setFeedback(null);
                      }}
                    >
                      {word}
                    </button>
                  ))}
                </div>
              )}
              <div className="memory-input-row">
                <input
                  ref={input}
                  id="memory-answer"
                  value={answer}
                  onChange={(event) => {
                    setAnswer(event.target.value);
                    setFeedback(null);
                  }}
                  inputMode={currentQuestion === 3 ? 'text' : 'numeric'}
                  autoComplete="off"
                  maxLength={24}
                  aria-invalid={feedback?.correct === false}
                  aria-describedby="memory-feedback"
                  placeholder={
                    currentQuestion === 3 ? 'Введи слово' : 'Твой расчёт'
                  }
                />
                <span>
                  {currentQuestion === 0
                    ? 'байт'
                    : currentQuestion === 1
                      ? 'знаков'
                      : currentQuestion === 2
                        ? 'букв'
                        : ''}
                </span>
              </div>
              <button
                type="submit"
                className="memory-submit"
                disabled={!answer.trim()}
              >
                Проверить <Icon name="arrow" />
              </button>
            </form>
          )}
          <div
            id="memory-feedback"
            className="memory-feedback"
            data-correct={feedback?.correct}
            role="status"
          >
            {feedback?.message}
          </div>
          {done ? (
            <div className="memory-finish">
              <span className="memory-finish-icon">
                <Icon name="check" />
              </span>
              <strong>
                {mode === 'guide' ? 'Теперь попробуй сам' : 'Задача решена!'}
              </strong>
              <p>
                {mode === 'guide'
                  ? 'Закрепи способ решения на новом примере.'
                  : 'Ты учёл размер символа, буквы и оба разделителя.'}
              </p>
              <button
                type="button"
                className="memory-submit"
                onClick={() => {
                  onNew(mode === 'guide' ? 'together' : mode);
                }}
              >
                {mode === 'guide' ? 'Решать по шагам' : 'Следующий вариант'}
                <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <div className="memory-tip">
              <span>ЗАПОМНИ</span>
              <p>Пробел тоже занимает память. Как буква или запятая.</p>
              <div aria-hidden="true">
                а <span>,</span> <span>␣</span>
              </div>
            </div>
          )}
          {mode !== 'guide' && !done && (
            <button
              type="button"
              className="memory-show-solution"
              onClick={() => {
                changeMode('guide');
              }}
            >
              Посмотреть разбор
            </button>
          )}
        </aside>
      </div>
      <div className="memory-bottom-note">
        <span>
          <Icon name="layers" /> Условная кодировка · 1 байт = 8 бит
        </span>
        <a href={sitePath('/stream/?numbers=1')}>
          К заданиям № 1 <Icon name="arrow" />
        </a>
      </div>
    </div>
  );
}

type MemoryActivity = 'list-delete' | SymbolScenario;
const memoryActivities: {
  id: MemoryActivity;
  title: string;
  detail: string;
}[] = [
  {
    id: 'list-delete',
    title: 'Удаление из списка',
    detail: 'Слово + запятая + пробел',
  },
  {
    id: 'sentence-delete',
    title: 'Удаление из предложения',
    detail: 'Слово + один пробел',
  },
  {
    id: 'sentence-repeat',
    title: 'Повтор в предложении',
    detail: 'Лишняя копия + пробел',
  },
  {
    id: 'list-repeat',
    title: 'Повтор в списке',
    detail: 'Лишняя копия + запятая + пробел',
  },
];
export default function MemoryLab() {
  const [activity, setActivity] = useState<MemoryActivity>('list-delete');
  const [variants, setVariants] = useState<Record<MemoryActivity, number>>({
    'list-delete': 0,
    'sentence-delete': 0,
    'sentence-repeat': 0,
    'list-repeat': 0,
  });
  const [initialMode, setInitialMode] = useState<Mode>('guide');
  const variant = variants[activity];
  function next() {
    setVariants((current) => ({
      ...current,
      [activity]: current[activity] + 1,
    }));
  }
  return (
    <>
      <nav className="memory-library" aria-label="Тип задачи про символы">
        {memoryActivities.map((item) => (
          <button
            type="button"
            key={item.id}
            data-memory-activity={item.id}
            aria-pressed={activity === item.id}
            onClick={() => {
              setActivity(item.id);
            }}
          >
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </nav>
      <p className="memory-library-note">
        У каждого типа своя подборка. Номер примера сохраняется при
        переключении; решения можно проходить в любом порядке.
      </p>
      {activity === 'list-delete' ? (
        <ProblemSession
          key={variant}
          variant={variant}
          initialMode={initialMode}
          onNew={(mode) => {
            setInitialMode(mode);
            next();
          }}
        />
      ) : (
        <SymbolPractice
          key={`${activity}:${String(variant)}`}
          scenario={activity}
          variant={variant}
          onNext={next}
        />
      )}
    </>
  );
}
