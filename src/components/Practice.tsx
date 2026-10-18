import { useRef, useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import TaskCard from './tasks/TaskCard';
import { useStatementRenderer } from './useStatementRenderer';
import { useHydrated } from './useHydrated';
import {
  homeTask,
  homeTopics,
  homeReference,
  homeStreamLink,
  type HomeTopic,
} from '../lib/home-practice';
import { initialStreamState } from '../lib/stream-start';
import { recordStoredResult } from '../core/stream/progress';
import { browserStore } from '../core/storage/browser';
import { referenceKey, type StreamOutcome } from '../core/stream';

export default function Practice({ initialHtml }: { initialHtml: string }) {
  const hydrated = useHydrated();
  const { renderer, error: loadingError } = useStatementRenderer();
  const ready = hydrated && renderer !== null;
  const [topic, setTopic] = useState<HomeTopic>('volume');
  const [indices, setIndices] = useState<Record<HomeTopic, number>>({
    volume: 0,
    logic: 0,
    binary: 0,
  });
  const [html, setHtml] = useState(initialHtml);
  const [solved, setSolved] = useState(0);
  const [error, setError] = useState('');
  const recorded = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const task = homeTask(topic, indices[topic]);
  const metadata = homeTopics.find((item) => item.id === topic);

  function select(nextTopic: HomeTopic, nextIndex: number) {
    if (!renderer) return;
    let next = homeTask(nextTopic, nextIndex);
    while (recorded.current.has(referenceKey(homeReference(next)))) {
      nextIndex += 1;
      next = homeTask(nextTopic, nextIndex);
    }
    const nextHtml = renderer(next.statement);
    setTopic(nextTopic);
    setIndices((previous) => ({ ...previous, [nextTopic]: nextIndex }));
    setHtml(nextHtml);
    setError('');
  }
  function accept(result: StreamOutcome) {
    const key = referenceKey(homeReference(task));
    if (recorded.current.has(key)) return;
    try {
      recordStoredResult(
        browserStore(),
        {
          ...initialStreamState(),
          current: { kind: 'random', reference: homeReference(task) },
        },
        result,
        new Date().toISOString(),
      );
      recorded.current.add(key);
      if (result.kind === 'automatic' && result.correct)
        setSolved((count) => count + 1);
    } catch {
      setError(
        'Не удалось сохранить результат. Экспортируй данные в настройках и освободи место.',
      );
    }
  }
  return (
    <div className="practice-layout">
      <div className="practice-sidebar">
        <fieldset className="topic-choices" disabled={!ready}>
          <legend>Выбери тему</legend>
          {homeTopics.map((item) => (
            <label
              className={`topic-option ${topic === item.id ? 'is-active' : ''}`}
              key={item.id}
            >
              <input
                type="radio"
                name="practice-topic"
                value={item.id}
                checked={topic === item.id}
                onChange={() => {
                  select(item.id, indices[item.id]);
                }}
              />
              <span className="topic-mark" aria-hidden="true">
                {item.mark}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>Тема №{item.number}</small>
              </span>
              <span className="topic-arrow" aria-hidden="true">
                →
              </span>
            </label>
          ))}
        </fieldset>
        <div className="session-note">
          <span className="session-dot" aria-hidden="true" />
          <div>
            <strong>
              Верных ответов: <span data-testid="solved-count">{solved}</span>
            </strong>
            <p>
              Счётчик — до перезагрузки; общий прогресс сохраняется в браузере.
            </p>
          </div>
        </div>
      </div>
      <Card className="exercise-card" aria-busy={!ready && !loadingError}>
        <div className="exercise-topline">
          <Badge>{metadata?.title}</Badge>
          <span className="exercise-position">
            Задание {indices[topic] + 1}
          </span>
        </div>
        <h3 className="home-task-heading" ref={heading} tabIndex={-1}>
          Разберём одну задачу
        </h3>
        <fieldset
          className="home-task-controls"
          aria-label="Задание и ответ"
          disabled={!ready}
        >
          <TaskCard
            key={`${topic}:${String(indices[topic])}`}
            task={task}
            statementHtml={html}
            onResult={accept}
          />
          <div className="exercise-bottom">
            <a href={homeStreamLink(task)}>
              Продолжить это задание в практике →
            </a>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                select(topic, indices[topic] + 1);
                heading.current?.focus();
              }}
            >
              Следующая задача →
            </Button>
          </div>
        </fieldset>
        {(loadingError || error) && <p role="alert">{loadingError || error}</p>}
      </Card>
    </div>
  );
}
