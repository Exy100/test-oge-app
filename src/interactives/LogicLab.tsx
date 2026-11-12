import { useRef, useState } from 'react';
import {
  logicAnswer,
  logicDomain,
  logicLabel,
  logicProblem,
  logicSolutions,
  logicTrace,
  logicValue,
  negateLogic,
  goalNames,
  truthName,
  type Comparison,
  type LogicNode,
} from '../lib/interactives/logic-lab';
import {
  useInteractiveInterval,
  useInteractiveRuntime,
} from '../lib/interactives/hooks';
import '../styles/logic-lab.css';
const activities = [
  ['explore', 'Проверяем число', 'Меняй X и следи за логикой'],
  ['collect', 'Собираем решения', 'Отметь все подходящие числа'],
  ['negate', 'Разбираемся с НЕ', 'Собери равносильное выражение'],
  ['exam', 'Решаем задание', 'Проверь себя без подсказок'],
] as const;
type Activity = (typeof activities)[number][0];
export default function LogicLab() {
  const [variant, setVariant] = useState(0);
  const [activity, setActivity] = useState<Activity>('explore');
  return (
    <div className="logic-lab">
      <nav className="logic-activities" aria-label="Что тренируем">
        {activities.map(([id, title, subtitle], i) => (
          <button
            type="button"
            key={id}
            aria-pressed={activity === id}
            onClick={() => {
              setActivity(id);
            }}
          >
            <span className="logic-number">0{i + 1}</span>
            <span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="logic-variant">
        <span>Учебный вариант {variant + 1}</span>
        <button
          type="button"
          onClick={() => {
            setVariant(variant + 1);
          }}
        >
          ↻ Новый вариант
        </button>
      </div>
      <LogicExercise
        key={`${activity}:${String(variant)}`}
        {...{ activity, variant }}
        onExplore={() => {
          setActivity('explore');
        }}
      />
    </div>
  );
}
function LogicExercise({
  activity,
  variant,
  onExplore,
}: {
  activity: Activity;
  variant: number;
  onExplore: () => void;
}) {
  const problem = logicProblem(variant);
  const domain = logicDomain(problem);
  const solutions = logicSolutions(problem);
  const [x, setX] = useState(5);
  const [draft, setDraft] = useState('5');
  const [inputError, setInputError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [checked, setChecked] = useState(false);
  const [answer, setAnswer] = useState('');
  const [solved, setSolved] = useState(false);
  const [flat, setFlat] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const runtime = useInteractiveRuntime(stage);
  const trace = logicTrace(problem.expression, x);
  useInteractiveInterval(
    () => {
      if (step === null || step >= trace.length - 1) setPlaying(false);
      else setStep(step + 1);
    },
    950,
    { ...runtime, active: runtime.active && playing },
  );
  function changeX(next: number) {
    setX(next);
    setDraft(String(next));
    setInputError('');
    setStep(null);
    setPlaying(false);
  }
  function toggle(value: number) {
    setSelected(
      selected.includes(value)
        ? selected.filter((n) => n !== value)
        : [...selected, value].sort((a, b) => a - b),
    );
    setChecked(false);
    setFeedback('');
    setSolved(false);
  }
  function checkSet() {
    setChecked(true);
    const extra = selected.find((n) => !solutions.includes(n));
    const missing = solutions.find((n) => !selected.includes(n));
    setSolved(extra === undefined && missing === undefined);
    setFeedback(
      extra !== undefined
        ? `Проверь X = ${String(extra)}: выражение даёт «${truthName(logicValue(problem.expression, extra))}», а нужна «${truthName(problem.target)}».`
        : missing !== undefined
          ? `Не хватает числа ${String(missing)}. Проверь, входит ли граница в решение.`
          : 'Верно! Ты нашёл все подходящие числа.',
    );
  }
  return (
    <>
      <section
        className="logic-condition"
        aria-labelledby="logic-condition-title"
      >
        <div>
          <p className="eyebrow">ПОЛНОЕ УСЛОВИЕ</p>
          <h2 id="logic-condition-title">
            {activity === 'negate'
              ? 'Раскрой отрицание'
              : goalNames[problem.goal]}
          </h2>
        </div>
        <div>
          {activity === 'negate' ? (
            <p>
              Замени отрицание выражением без внешнего НЕ. Новое выражение
              должно давать тот же результат при каждом допустимом X.
            </p>
          ) : (
            <>
              <p>
                Рассматриваются {problem.lower === 0 ? 'целые' : 'натуральные'}{' '}
                числа X от {problem.lower} до {problem.upper} включительно.
                Найди{' '}
                {problem.goal === 'count'
                  ? 'количество чисел'
                  : problem.goal === 'min'
                    ? 'наименьшее число'
                    : 'наибольшее число'}{' '}
                X, при которых выражение {problem.target ? 'истинно' : 'ложно'}.
              </p>
              <p className="logic-formula">{logicLabel(problem.expression)}</p>
            </>
          )}
        </div>
      </section>
      {activity === 'negate' ? (
        <Negation variant={variant} />
      ) : (
        <>
          <div className="logic-target">
            <span>
              Область:{' '}
              <strong>
                {problem.lower}…{problem.upper}, целые
              </strong>
            </span>
            <span>
              Нужна: <strong>{truthName(problem.target)}</strong>
            </span>
            <span>
              В ответ: <strong>{goalNames[problem.goal].toLowerCase()}</strong>
            </span>
          </div>
          {activity === 'explore' && (
            <section
              ref={stage}
              className="logic-workspace"
              id="logic-workspace"
              aria-label="Проверка числа"
              data-flat={flat}
            >
              <div className="logic-stage-heading">
                <div>
                  <p className="eyebrow">ЧИСЛО → СРАВНЕНИЯ → РЕЗУЛЬТАТ</p>
                  <h2>Что произойдёт при X = {x}?</h2>
                </div>
                <button
                  type="button"
                  aria-pressed={flat}
                  onClick={() => {
                    setFlat(!flat);
                  }}
                >
                  {flat ? '◇ Плоский вид' : '▱ Объёмный вид'}
                </button>
              </div>
              <div className="logic-input-row">
                <button
                  type="button"
                  aria-label="Уменьшить X"
                  disabled={x <= problem.lower}
                  onClick={() => {
                    changeX(x - 1);
                  }}
                >
                  −
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = Number(draft);
                    if (
                      !/^\d+$/u.test(draft) ||
                      !Number.isInteger(value) ||
                      value < problem.lower ||
                      value > problem.upper
                    )
                      setInputError(
                        `Введи целое число от ${String(problem.lower)} до ${String(problem.upper)}.`,
                      );
                    else changeX(value);
                  }}
                >
                  <label htmlFor="logic-x">Число X</label>
                  <input
                    id="logic-x"
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                    }}
                    aria-describedby="logic-input-error"
                  />
                  <button type="submit">Подставить</button>
                </form>
                <button
                  type="button"
                  aria-label="Увеличить X"
                  disabled={x >= problem.upper}
                  onClick={() => {
                    changeX(x + 1);
                  }}
                >
                  +
                </button>
              </div>
              <p id="logic-input-error" role="status">
                {inputError}
              </p>
              <label className="logic-slider">
                Быстро изменить X
                <input
                  type="range"
                  min={problem.lower}
                  max={problem.upper}
                  value={x}
                  onChange={(e) => {
                    changeX(Number(e.target.value));
                  }}
                />
              </label>
              <div className="logic-controls">
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => {
                    setPlaying(false);
                    setStep(Math.max(0, (step ?? trace.length) - 1));
                  }}
                >
                  ← Шаг назад
                </button>
                <button
                  type="button"
                  disabled={step === trace.length - 1}
                  onClick={() => {
                    setPlaying(false);
                    setStep(step === null ? 0 : step + 1);
                  }}
                >
                  Следующий шаг →
                </button>
                <button
                  type="button"
                  disabled={runtime.reducedMotion}
                  onClick={() => {
                    if (playing) setPlaying(false);
                    else {
                      if (step === null || step >= trace.length - 1) setStep(0);
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? 'Пауза' : '▷ Анимация'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(null);
                    setPlaying(false);
                  }}
                >
                  Все шаги
                </button>
              </div>
              <p className="logic-explanation" role="status">
                {step === null
                  ? `При X = ${String(x)} выражение даёт «${truthName(logicValue(problem.expression, x))}». Это число ${logicValue(problem.expression, x) === problem.target ? 'подходит' : 'не подходит'} под условие.`
                  : trace[step]?.explanation}
              </p>
              <ol className="logic-flow" aria-label="Порядок вычисления">
                {trace.map((row, index) => (
                  <li
                    key={index}
                    className="logic-node"
                    data-current={step === index}
                    data-pending={step !== null && index > step}
                  >
                    <span className="logic-kicker">
                      {index === trace.length - 1
                        ? 'ИТОГ'
                        : `ШАГ ${String(index + 1)}`}
                    </span>
                    <strong>{row.label}</strong>
                    <span className="logic-substitution">
                      {row.label.replaceAll('X', String(x))}
                    </span>
                    <span className="logic-truth" data-truth={row.result}>
                      {step !== null && index > step
                        ? '…'
                        : truthName(row.result)}
                    </span>
                  </li>
                ))}
              </ol>
              {runtime.reducedMotion && (
                <p className="logic-note">
                  Движение отключено в настройках устройства. Доступны все шаги
                  вручную.
                </p>
              )}
              <details>
                <summary>Как читать схему</summary>
                <p>
                  Карточки идут в порядке вычисления: сначала сравнения, затем
                  операции. НЕ действует на всё внутри своих скобок. И требует
                  двух истинных частей; ИЛИ — хотя бы одной. Истина и ложь
                  подписаны словами.
                </p>
              </details>
            </section>
          )}
          {(activity === 'collect' || activity === 'exam') && (
            <section
              className="logic-workspace"
              id="logic-workspace"
              aria-labelledby="logic-selection-title"
            >
              <p className="eyebrow">
                {activity === 'exam'
                  ? 'САМОСТОЯТЕЛЬНО'
                  : 'ТВОЁ МНОЖЕСТВО РЕШЕНИЙ'}
              </p>
              <h2 id="logic-selection-title">
                {activity === 'exam'
                  ? 'Реши и запиши ответ'
                  : 'Какие числа подходят?'}
              </h2>
              <p>
                Нажми на число, чтобы отметить его. Повторное нажатие снимает
                отметку. Показана вся область из условия.
              </p>
              <div
                className="logic-number-line"
                role="group"
                aria-label="Числа для выбора"
              >
                {domain.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`Число ${String(n)}`}
                    aria-pressed={selected.includes(n)}
                    data-result={
                      checked
                        ? solutions.includes(n)
                          ? 'yes'
                          : 'no'
                        : undefined
                    }
                    onClick={() => {
                      toggle(n);
                    }}
                  >
                    <span>{n}</span>
                    <small>
                      {checked
                        ? solutions.includes(n)
                          ? '✓'
                          : '−'
                        : selected.includes(n)
                          ? '●'
                          : '○'}
                    </small>
                  </button>
                ))}
              </div>
              <p className="logic-selection" role="status">
                Выбрано:{' '}
                {selected.length ? selected.join(', ') : 'пока ни одного'}{' '}
                <span>Всего: {selected.length}</span>
              </p>
              <div className="logic-controls">
                <button
                  type="button"
                  onClick={() => {
                    setSelected([]);
                    setChecked(false);
                    setFeedback('');
                    setSolved(false);
                  }}
                >
                  Очистить выбор
                </button>
                {activity === 'collect' && (
                  <button
                    type="button"
                    className="logic-primary"
                    onClick={checkSet}
                  >
                    Проверить множество
                  </button>
                )}
              </div>
              {activity === 'exam' && (
                <form
                  className="logic-answer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const correct =
                      /^\d+$/u.test(answer.trim()) &&
                      Number(answer) === logicAnswer(problem);
                    setSolved(correct);
                    setChecked(correct);
                    setFeedback(
                      correct
                        ? 'Верно! Задача решена.'
                        : 'Пока неверно. Проверь границы, требуемую истину или ложь и то, что нужно записать в ответ.',
                    );
                  }}
                >
                  <label htmlFor="logic-answer">
                    Твой ответ: {goalNames[problem.goal].toLowerCase()}
                  </label>
                  <div>
                    <input
                      id="logic-answer"
                      inputMode="numeric"
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        setFeedback('');
                        setSolved(false);
                        setChecked(false);
                      }}
                    />
                    <button type="submit" className="logic-primary">
                      Проверить ответ
                    </button>
                  </div>
                </form>
              )}
              <p className="logic-feedback" role="status">
                {feedback}
              </p>
              {checked && (
                <p className="logic-note">
                  ✓ — подходит под условие; − — не подходит. Заливка сохраняет
                  твой выбор.
                </p>
              )}
              {solved && (
                <div className="logic-success">
                  <strong>Ответ: {logicAnswer(problem)}</strong>
                  <p>Подходящие числа: {solutions.join(', ')}.</p>
                  <p>
                    {problem.goal === 'count'
                      ? `Считаем все выбранные числа: ${String(solutions.length)}.`
                      : problem.goal === 'min'
                        ? 'Берём первое число в упорядоченном множестве. Все меньшие числа из области не подходят.'
                        : 'Берём последнее число в упорядоченном множестве. Все большие числа из области не подходят.'}
                  </p>
                </div>
              )}
              {activity === 'exam' && (
                <button type="button" onClick={onExplore}>
                  Перейти к разбору этого варианта
                </button>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
function Negation({ variant }: { variant: number }) {
  const a = 5 + (variant % 9);
  const b = a + 4;
  const operation = variant % 2 ? 'and' : 'or';
  const source: LogicNode = {
    kind: 'not',
    child: {
      kind: operation,
      left: { kind: 'compare', op: '<', value: a },
      right: { kind: 'compare', op: '>', value: b },
    },
  };
  const [left, setLeft] = useState<Comparison>('<');
  const [right, setRight] = useState<Comparison>('>');
  const [join, setJoin] = useState<'and' | 'or'>(operation);
  const [feedback, setFeedback] = useState('');
  const [correct, setCorrect] = useState(false);
  const [example, setExample] = useState<number | null>(null);
  const candidate: LogicNode = {
    kind: join,
    left: { kind: 'compare', op: left, value: a },
    right: { kind: 'compare', op: right, value: b },
  };
  function resetFeedback() {
    setFeedback('');
    setCorrect(false);
    setExample(null);
  }
  return (
    <section
      className="logic-workspace"
      id="logic-workspace"
      aria-labelledby="logic-negation-title"
    >
      <p className="eyebrow">КОНСТРУКТОР ОТРИЦАНИЯ</p>
      <h2 id="logic-negation-title">Что изменит НЕ?</h2>
      <p>
        Допустимы целые X от 0 до {b + 3}. Поменяй знаки сравнений и связку
        между частями.
      </p>
      <p className="logic-formula">{logicLabel(source)}</p>
      <div className="logic-builder">
        <label>
          Левая часть: X
          <select
            value={left}
            onChange={(e) => {
              setLeft(e.target.value as Comparison);
              resetFeedback();
            }}
          >
            {(['<', '≤', '>', '≥'] as const).map((op) => (
              <option key={op}>{op}</option>
            ))}
          </select>
          {a}
        </label>
        <label>
          Связка
          <select
            value={join}
            onChange={(e) => {
              setJoin(e.target.value as 'and' | 'or');
              resetFeedback();
            }}
          >
            <option value="and">И</option>
            <option value="or">ИЛИ</option>
          </select>
        </label>
        <label>
          Правая часть: X
          <select
            value={right}
            onChange={(e) => {
              setRight(e.target.value as Comparison);
              resetFeedback();
            }}
          >
            {(['<', '≤', '>', '≥'] as const).map((op) => (
              <option key={op}>{op}</option>
            ))}
          </select>
          {b}
        </label>
      </div>
      <p className="logic-formula">{logicLabel(candidate)}</p>
      <button
        type="button"
        className="logic-primary"
        onClick={() => {
          const counter = Array.from({ length: b + 4 }, (_, i) => i).find(
            (x) => logicValue(source, x) !== logicValue(candidate, x),
          );
          setExample(counter ?? null);
          setCorrect(counter === undefined);
          setFeedback(
            counter === undefined
              ? 'Верно! Выражения совпадают для каждого числа из области.'
              : `Контрпример: X = ${String(counter)}. Исходное выражение: ${truthName(logicValue(source, counter))}; твоё: ${truthName(logicValue(candidate, counter))}.`,
          );
        }}
      >
        Проверить преобразование
      </button>
      <p className="logic-feedback" role="status">
        {feedback}
      </p>
      {example !== null && (
        <div className="logic-counterexample">
          <strong>Подставим X = {example}</strong>
          {[source, candidate].map((node, i) => (
            <p key={i}>
              {i === 0 ? 'Было' : 'Получилось'}:{' '}
              {logicLabel(node).replaceAll('X', String(example))} →{' '}
              <strong>{truthName(logicValue(node, example))}</strong>
            </p>
          ))}
          <p>Проверь оба знака, равенство на границах и связку И / ИЛИ.</p>
        </div>
      )}
      {correct && (
        <div className="logic-success">
          <strong>{logicLabel(negateLogic(source.child))}</strong>
          <p>
            По закону де Моргана меняем И на ИЛИ или ИЛИ на И и отрицаем каждое
            сравнение. Отрицание строгого сравнения включает равенство.
          </p>
        </div>
      )}
      <details>
        <summary>Нужна подсказка</summary>
        <p>
          НЕ (X &lt; a) означает X ≥ a. НЕ (X &gt; b) означает X ≤ b. Отрицание
          ИЛИ превращается в И, а отрицание И — в ИЛИ.
        </p>
      </details>
    </section>
  );
}
