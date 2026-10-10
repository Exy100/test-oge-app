import { useEffect, useState } from 'react';
import { generators, getGenerator } from '../core/generators';
import { validateGeneratedTask } from '../core/generators/harness';
import type { TaskInstance } from '../core/types';
import RichText from '../components/RichText';

export default function GeneratorGallery() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
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
            const generator = getGenerator(id);
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
            {generators.map((generator) => (
              <option key={generator.id} value={generator.id}>
                №{generator.taskNumber} — {generator.title}
              </option>
            ))}
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
          <p>
            <strong>Ответ:</strong>{' '}
            {task.answer.type === 'artifact'
              ? task.answer.referenceId
              : task.answer.value}
          </p>
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
