import { useState } from 'react';
import { useHydrated } from '../components/useHydrated';
import { generators } from '../core/generators';
import { learningGenerators } from '../core/generators/learning';
import { validateGeneratedTask } from '../core/generators/harness';
import type { TaskInstance } from '../core/types';
import RichText from '../components/RichText';
import TaskFiles from '../components/tasks/TaskFiles';
import Figure from '../components/Figure';
import { isRobotKind, robotExample } from '../core/generators/15/fields';

const reviewGenerators = [...generators, ...learningGenerators];

export default function GeneratorGallery() {
  const ready = useHydrated();
  const [id, setId] = useState(generators[0]?.id ?? '');
  const [seed, setSeed] = useState('example');
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [error, setError] = useState('');
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const generator = reviewGenerators.find((entry) => entry.id === id);
            if (!generator) throw new Error('Генератор не найден.');
            const next = Array.from({ length: 20 }, (_, index) =>
              validateGeneratedTask(generator, `${seed}:${String(index)}`),
            );
            setTasks(next);
            setError('');
          } catch (cause) {
            setTasks([]);
            setError(
              cause instanceof Error
                ? cause.message
                : 'Не удалось создать задачи.',
            );
          }
        }}
      >
        <label>
          Генератор
          <select
            disabled={!ready}
            value={id}
            onChange={(event) => {
              setId(event.target.value);
            }}
          >
            <optgroup label="Основной реестр">
              {generators.map((generator) => (
                <option key={generator.id} value={generator.id}>
                  №{generator.taskNumber} — {generator.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Отдельные учебные упражнения: не входят в варианты ОГЭ">
              {learningGenerators.map((generator) => (
                <option key={generator.id} value={generator.id}>
                  №{generator.taskNumber} — {generator.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Seed
          <input
            disabled={!ready}
            maxLength={200}
            value={seed}
            onChange={(event) => {
              setSeed(event.target.value);
            }}
          />
        </label>
        <button className="button button-dark" type="submit" disabled={!ready}>
          Показать 20 задач
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">Создано задач: {tasks.length}</p>
      {tasks.map((task, index) => (
        <article key={task.id} className="generator-example">
          <h2>
            {index + 1}. Задание №{task.taskNumber}
          </h2>
          <p>
            Seed: <code>{task.seed}</code>
          </p>
          <RichText source={task.statement} />
          {task.figure && (
            <Figure
              spec={task.figure}
              label={`Схема, задача ${String(index + 1)}`}
            />
          )}
          {isRobotKind(task.subtype) && (
            <Figure
              spec={robotExample(task.subtype, task.seed)}
              label={`Поле Робота, задача ${String(index + 1)}`}
            />
          )}
          {task.datasetId && <TaskFiles task={task} />}
          <p>
            <strong>Ответ:</strong>{' '}
            {task.answer.type === 'artifact'
              ? task.answer.referenceId
              : task.answer.value}
          </p>
          {task.answer.type === 'sequence' && task.answer.alternatives && (
            <p>Также принимаются: {task.answer.alternatives.join(', ')}.</p>
          )}
          {task.answer.type === 'integer' && task.answer.acceptedRange && (
            <p>
              Принимается любое целое
              {task.answer.acceptedRange.min !== undefined
                ? ` от ${task.answer.acceptedRange.min}`
                : ''}
              {task.answer.acceptedRange.max !== undefined
                ? ` до ${task.answer.acceptedRange.max}`
                : ''}{' '}
              включительно.
            </p>
          )}
          <h3>Решение</h3>
          <ol>
            {task.solution.map((step, stepIndex) => (
              <li key={stepIndex}>
                <RichText source={step.text} />
                {step.formula && <RichText source={`$$${step.formula}$$`} />}
                {step.code && (
                  <pre>
                    <code>{step.code}</code>
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </>
  );
}
