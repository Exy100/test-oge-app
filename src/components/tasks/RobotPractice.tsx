import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RobotExecution, type RobotResult } from '../../core/robot';
import {
  fieldFor,
  robotCases,
  type RobotKind,
} from '../../core/generators/15/fields';
import Figure from '../Figure';
import CodeEditor from './CodeEditor';

export default function RobotPractice({
  kind,
  seed,
  mode = 'practice',
  value,
  onChange,
  maxLength,
}: {
  kind: RobotKind;
  seed: string;
  mode?: 'practice' | 'exam';
  value?: string;
  onChange?: (code: string) => void;
  maxLength?: number;
}) {
  const fields = useMemo(() => {
    const cases = robotCases(kind, seed);
    return (mode === 'exam' ? cases.slice(0, 1) : cases).map(fieldFor);
  }, [kind, seed, mode]);
  const fieldId = useId();
  const [index, setIndex] = useState(0);
  const field = fields[index];
  const [localCode, setLocalCode] = useState('');
  const code = value ?? localCode;
  const [result, setResult] = useState<RobotResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const execution = useRef<RobotExecution | null>(null);
  useEffect(
    () => () => {
      execution.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const next = execution.current?.run(16);
      if (next) {
        setResult(next);
        if (next.status !== 'running' && next.status !== 'ready')
          setRunning(false);
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);
  if (!field) throw new Error('Поле Робота не найдено.');
  function reset() {
    execution.current?.cancel();
    execution.current = null;
    setRunning(false);
    setResult(null);
    setError('');
  }
  function prepare() {
    if (!field) return null;
    try {
      if (!execution.current)
        execution.current = new RobotExecution(code, field);
      setError('');
      return execution.current;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Проверь программу.');
      return null;
    }
  }
  const finished =
    result !== null && !['ready', 'running'].includes(result.status);
  return (
    <section className="robot-practice" aria-label="Тренажёр Робота">
      <h3>
        {mode === 'exam'
          ? 'Проверь алгоритм на примере'
          : 'Проверь алгоритм на полях'}
      </h3>
      <p>
        Круги обозначают клетки для закраски.{' '}
        {mode === 'exam'
          ? 'Здесь доступно поле из условия. Программа должна работать на всех допустимых полях семейства; успех на этом примере этого не доказывает. Проверочные поля откроются после завершения экзамена.'
          : 'Проверь все поля: успех на одном примере ещё не доказывает общий алгоритм. Это учебная проверка; балл выбирай отдельно по критериям.'}
      </p>
      <label htmlFor={fieldId}>
        Поле Робота
        <select
          id={fieldId}
          aria-label="Поле Робота"
          value={index}
          onChange={(event) => {
            reset();
            setIndex(Number(event.target.value));
          }}
        >
          {fields.map((_, position) => (
            <option key={position} value={position}>
              Поле {position + 1} из {fields.length}
            </option>
          ))}
        </select>
      </label>
      <Figure
        spec={
          result
            ? {
                ...field,
                start: result.position,
                painted: result.painted,
                description:
                  'Текущее состояние Робота: круги — цели, знак Робота — его положение.',
              }
            : field
        }
        label="Поле выполнения"
      />
      <CodeEditor
        value={code}
        onChange={(nextCode) => {
          reset();
          if (onChange) onChange(nextCode);
          else setLocalCode(nextCode);
        }}
        language="robot"
        disabled={running}
        maxLength={maxLength ?? (mode === 'exam' ? 20000 : 32000)}
      />
      <details>
        <summary>Команды и синтаксис</summary>
        <p>
          вверх, вниз, влево, вправо, закрасить — по команде на строке. Датчики:
          сверху/снизу/слева/справа свободно или стена; клетка закрашена или не
          закрашена.
        </p>
        <pre tabIndex={0} role="region" aria-label="Пример синтаксиса">
          {
            'нц пока справа свободно\n  вправо\nкц\n\nесли клетка не закрашена то\n  закрасить\nвсе'
          }
        </pre>
        <p>
          Повторение: «нц 5 раз» и «кц». Доступны «иначе», оболочка
          «использовать Робот / алг / нач / кон». Лимит — 10 000 шагов. Условия
          можно объединять словами «и», «или», «не» и скобками.
        </p>
      </details>
      <div className="task-actions">
        <button
          type="button"
          disabled={running || finished}
          onClick={() => {
            if (prepare()) setRunning(true);
          }}
        >
          Запустить
        </button>
        <button
          type="button"
          disabled={!running}
          onClick={() => {
            setRunning(false);
          }}
        >
          Пауза
        </button>
        <button
          type="button"
          disabled={running || finished}
          onClick={() => {
            const next = prepare();
            if (next) {
              next.step();
              setResult(next.snapshot());
            }
          }}
        >
          Шаг
        </button>
        <button type="button" onClick={reset}>
          Сбросить выполнение
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-label="Выполнение Робота">
        {running
          ? 'Программа выполняется.'
          : result
            ? `${result.message} Шагов: ${String(result.steps)}. Строка: ${String(result.position.row + 1)}, столбец: ${String(result.position.column + 1)}.`
            : 'Готов к запуску.'}
      </p>
    </section>
  );
}
