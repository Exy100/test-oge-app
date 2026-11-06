import { useEffect, useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';

const scenes = [
  {
    value: 2,
    explanation: 'Начинаем с числа 2. Программа 121 выполняется слева направо.',
  },
  { value: 4, explanation: 'Команда 1: возводим 2 в квадрат. Получаем 4.' },
  { value: 6, explanation: 'Команда 2: прибавляем 2 к числу 4. Получаем 6.' },
  {
    value: 36,
    explanation:
      'Команда 1: возводим 6 в квадрат. Получаем 36. Цель достигнута.',
  },
] as const;
export default function ExecutorWorkshop({
  id,
  active,
  reducedMotion,
}: InteractiveProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [commands, setCommands] = useState(['1', '1', '2']);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [answer, setAnswer] = useState('');
  useEffect(() => {
    if (!playing || !active || reducedMotion || step === 3) return;
    const timer = window.setTimeout(() => {
      setStep((value) => Math.min(3, value + 1));
    }, 1800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [playing, active, reducedMotion, step]);
  const running = playing && step < 3;
  function move(from: number, to: number) {
    if (from < 0 || from > 2 || to < 0 || to > 2) return;
    const next = [...commands];
    const [command] = next.splice(from, 1);
    if (command === undefined) return;
    next.splice(to, 0, command);
    setCommands(next);
    setSelected(null);
    setChecked(false);
  }
  const result = commands.reduce(
    (value, command) => (command === '1' ? value * value : value + 2),
    2,
  );
  return (
    <div className="information-lab executor-workshop">
      <h3>1. Посмотри: как работает программа 121</h3>
      <p>Команда 1 — возвести число в квадрат. Команда 2 — прибавить 2.</p>
      <p
        className="executor-value"
        aria-label={`Текущее число: ${String((scenes[step] ?? scenes[0]).value)}`}
      >
        {(scenes[step] ?? scenes[0]).value}
      </p>
      <label htmlFor={`${id}-step`}>Шаг выполнения: {step} из 3</label>
      <input
        id={`${id}-step`}
        type="range"
        min="0"
        max="3"
        value={step}
        onChange={(event) => {
          setPlaying(false);
          setStep(Number(event.target.value));
        }}
      />
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-light"
          disabled={step === 0}
          onClick={() => {
            setPlaying(false);
            setStep(step - 1);
          }}
        >
          Шаг назад
        </button>
        <button
          type="button"
          className="button button-light"
          disabled={step === 3}
          onClick={() => {
            setPlaying(false);
            setStep(step + 1);
          }}
        >
          Шаг вперёд
        </button>
        {!reducedMotion && (
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              if (running) setPlaying(false);
              else {
                if (step === 3) setStep(0);
                setPlaying(true);
              }
            }}
          >
            {running ? 'Остановить показ' : 'Воспроизвести'}
          </button>
        )}
      </div>
      <p role="status">{(scenes[step] ?? scenes[0]).explanation}</p>
      <h3>2. Попробуй: собери программу</h3>
      <p>
        Из числа 2 получи 36, используя эти три карточки. Перетащи карточку на
        нужное место или выбери её нажатием, затем нажми на место назначения.
        Кнопки со стрелками также меняют порядок.
      </p>
      <div className="executor-cards">
        {commands.map((command, index) => (
          <div key={index}>
            <button
              type="button"
              className="button button-light"
              draggable
              aria-pressed={selected === index}
              aria-label={`Место ${String(index + 1)}: команда ${command}`}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = event.dataTransfer.getData('text/plain');
                if (/^[012]$/u.test(source)) move(Number(source), index);
              }}
              onClick={() => {
                if (selected === null) setSelected(index);
                else move(selected, index);
              }}
            >
              {index + 1}. Команда {command}
            </button>
            <div className="interactive-toolbar">
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Сдвинуть карточку ${String(index + 1)} влево`}
                onClick={() => {
                  move(index, index - 1);
                }}
              >
                ←
              </button>
              <button
                type="button"
                disabled={index === 2}
                aria-label={`Сдвинуть карточку ${String(index + 1)} вправо`}
                onClick={() => {
                  move(index, index + 1);
                }}
              >
                →
              </button>
            </div>
          </div>
        ))}
      </div>
      <p>
        Твоя программа: <strong>{commands.join('')}</strong>
      </p>
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          setChecked(true);
        }}
      >
        Проверить порядок
      </button>
      <p role="status">
        {checked
          ? result === 36
            ? 'Верно! 2 → 4 → 6 → 36. Прибавление должно стоять между возведениями в квадрат.'
            : `Получилось ${String(result)}, а нужно 36. Попробуй поставить прибавление между двумя возведениями в квадрат.`
          : selected !== null
            ? `Выбрана карточка ${String(selected + 1)}. Теперь выбери её новое место.`
            : ''}
      </p>
      <h3>3. Проверь понимание: обратный ход</h3>
      <fieldset>
        <legend>
          Последней выполнили команду «прибавь 2» и получили 18. Какое число
          было перед ней?
        </legend>
        {['9', '16', '20'].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={`${id}-answer`}
              value={value}
              checked={answer === value}
              onChange={() => {
                setAnswer(value);
              }}
            />{' '}
            {value}
          </label>
        ))}
      </fieldset>
      <p role="status">
        {answer
          ? answer === '16'
            ? 'Верно: отменяем прибавление вычитанием. 18 − 2 = 16.'
            : 'Попробуй ещё: нужно отменить именно последнюю команду. Обратная операция для «прибавь 2» — «вычти 2».'
          : ''}
      </p>
    </div>
  );
}
