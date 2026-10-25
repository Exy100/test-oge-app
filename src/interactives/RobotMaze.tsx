import { useEffect, useRef, useState } from 'react';
import { RobotExecution, type RobotResult } from '../core/robot';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  mazeLevels,
  mazeField,
  checkMaze,
  mazeSensors,
} from '../lib/interactives/factory-games';
import { saveGameLevel } from '../lib/interactives/games';
import { browserStore } from '../core/storage/browser';
import GameLevels from '../components/lessons/GameLevels';
import GameView from '../components/three/GameView';
import MazeDiagram from '../components/lessons/MazeDiagram';
import CodeEditor from '../components/tasks/CodeEditor';

export default function RobotMaze({
  id,
  active,
  reducedMotion,
}: InteractiveProps) {
  const [selected, setSelected] = useState(0),
    [example, setExample] = useState(0),
    [code, setCode] = useState('закрасить');
  const [result, setResult] = useState<RobotResult | null>(null),
    [feedback, setFeedback] = useState(''),
    [running, setRunning] = useState(false);
  const execution = useRef<RobotExecution | null>(null);
  const level = mazeLevels[selected],
    field = mazeField(selected, example);
  if (!level) throw new RangeError('Неизвестный уровень Робота.');
  function reset() {
    execution.current?.cancel();
    execution.current = null;
    setRunning(false);
    setResult(null);
    setFeedback('');
  }
  function advance(all = false) {
    try {
      const machine =
        execution.current ??
        new RobotExecution(code, field, { maxSteps: 1000 });
      execution.current = machine;
      if (all) machine.run();
      else machine.step();
      const next = machine.snapshot();
      setResult(next);
      if (!['ready', 'running'].includes(next.status)) setRunning(false);
      setFeedback(next.message);
    } catch (cause) {
      setRunning(false);
      setFeedback(cause instanceof Error ? cause.message : 'Проверь код.');
    }
  }
  useEffect(() => {
    if (!running || !active || reducedMotion) return;
    const timer = window.setInterval(() => {
      const machine = execution.current;
      if (!machine) return;
      machine.step();
      const next = machine.snapshot();
      setResult(next);
      setFeedback(next.message);
      if (!['ready', 'running'].includes(next.status)) setRunning(false);
    }, 150);
    return () => {
      window.clearInterval(timer);
    };
  }, [running, active, reducedMotion]);
  useEffect(() => () => execution.current?.cancel(), []);
  const current = {
    ...field,
    start: result?.position ?? field.start,
    painted: result?.painted ?? field.painted,
  };
  return (
    <div className="information-lab">
      <p>
        Учебная игра по теме №15. Напиши одну программу для трёх полей уровня.
        Закрась все отмеченные клетки и только их. Стены и датчики действуют как
        на двумерном поле.
      </p>
      <GameLevels
        id={id}
        gameId="robot-maze"
        lessonId="robot-loops"
        levels={mazeLevels}
        selected={selected}
        onSelect={(index) => {
          reset();
          setSelected(index);
          setExample(0);
        }}
      />
      <p>{level.goal}</p>
      <label htmlFor={`${id}-field`}>Поле для пошагового запуска</label>
      <select
        id={`${id}-field`}
        value={example}
        onChange={(event) => {
          reset();
          setExample(Number(event.target.value));
        }}
      >
        {level.fields.map((_, i) => (
          <option key={i} value={i}>
            Поле {i + 1}
          </option>
        ))}
      </select>
      <GameView
        id={id}
        active={active}
        reducedMotion={reducedMotion}
        modulePath="/src/interactives/Maze3D.tsx"
        parameters={{
          level: selected,
          example,
          row: current.start.row,
          column: current.start.column,
          painted: current.painted.map(
            (cell) => cell.row * field.columns + cell.column,
          ),
        }}
        fallback={
          <MazeDiagram
            field={field}
            position={current.start}
            painted={current.painted}
          />
        }
      />
      <p role="status">
        Робот: строка {current.start.row + 1}, столбец{' '}
        {current.start.column + 1}. Шагов: {result?.steps ?? 0}.{' '}
        {mazeSensors(field, current.start)
          .map(
            (sensor) =>
              `${sensor.command}: ${sensor.free ? 'свободно' : 'стена'}`,
          )
          .join('; ')}
        .
      </p>
      <CodeEditor
        value={code}
        onChange={(value) => {
          reset();
          setCode(value);
        }}
        language="robot"
        maxLength={8000}
      />
      <details>
        <summary>Команды, датчики и циклы</summary>
        <p>
          По команде на строке: вверх, вниз, влево, вправо, закрасить. Датчики:
          сверху/снизу/слева/справа свободно или стена, клетка закрашена или не
          закрашена. Условия можно соединять И, ИЛИ, НЕ и скобками.
        </p>
        <pre>
          {
            'нц пока справа свободно\n  вправо\nкц\nесли слева стена то\n  закрасить\nвсе'
          }
        </pre>
        <p>
          Каждый запуск ограничен 1000 шагами. При выключенной анимации
          используй шаг или выполнение до конца. При изменении кода выполнение
          сбрасывается.
        </p>
      </details>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button"
          onClick={() => {
            setRunning(false);
            advance();
          }}
        >
          Шаг программы
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setRunning(false);
            advance(true);
          }}
        >
          Выполнить до конца
        </button>
        <button
          type="button"
          className="button"
          disabled={reducedMotion}
          aria-pressed={running}
          onClick={() => {
            if (running) setRunning(false);
            else {
              try {
                const machine =
                  execution.current ??
                  new RobotExecution(code, field, { maxSteps: 1000 });
                execution.current = machine;
                setRunning(
                  ['ready', 'running'].includes(machine.snapshot().status),
                );
                setFeedback(machine.snapshot().message);
              } catch (cause) {
                setFeedback(
                  cause instanceof Error ? cause.message : 'Проверь программу.',
                );
              }
            }
          }}
        >
          Автовыполнение
        </button>
        <button type="button" className="button" onClick={reset}>
          Сбросить запуск
        </button>
      </div>
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          setRunning(false);
          const checked = checkMaze(level, code);
          setFeedback(checked.message);
          if (checked.correct)
            saveGameLevel(
              browserStore(),
              'robot-loops',
              'robot-maze',
              level.id,
            );
        }}
      >
        Проверить на трёх полях
      </button>
      <p role="status">{feedback}</p>
    </div>
  );
}
