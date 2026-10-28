import { useEffect, useId, useRef, useState } from 'react';
import type { FeedbackRequest } from '../../lib/ai/contract';
import { feedbackSource, loadFeedbackProvider } from '../../lib/ai/provider';
import RichTextView from '../RichTextView';
import feedbackUrl from '../../lib/ai/feedback.ts?module-url';
import { importFreshModule } from '../../lib/fresh-module';
import { preparationLessons } from '../../lib/lessons/preparation';
import { sitePath } from '../../lib/site';

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'stopped' | 'error';

export default function AiPanel({
  request,
  taskNumber,
}: {
  request: FeedbackRequest;
  taskNumber: number;
}) {
  const id = useId();
  const active = useRef<AbortController | null>(null);
  const output = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const busy = status === 'loading' || status === 'streaming';
  const lessons = preparationLessons.filter(
    (lesson) => lesson.taskNumber === taskNumber,
  );
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (status === 'done') output.current?.focus();
    else if (status === 'stopped' || status === 'error')
      action.current?.focus();
  }, [status]);

  async function start() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setStatus('loading');
    setHtml('');
    setError('');
    let describeError: (error: unknown) => string = () =>
      'Не удалось открыть разбор. Попробуй ещё раз — твой ответ и черновик сохранены.';
    try {
      const [provider, feedback] = await Promise.all([
        loadFeedbackProvider(),
        importFreshModule<typeof import('../../lib/ai/feedback')>(feedbackUrl),
      ]);
      if (controller.signal.aborted) return;
      describeError = feedback.feedbackErrorMessage;
      await feedback.consumeFeedback(
        provider,
        request,
        controller.signal,
        (next) => {
          if (controller.signal.aborted) return;
          setHtml(next);
          setStatus('streaming');
        },
      );
      controller.signal.throwIfAborted();
      setStatus('done');
    } catch (error) {
      if (!controller.signal.aborted) {
        setHtml('');
        setError(describeError(error));
        setStatus('error');
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  }

  function stop() {
    active.current?.abort();
    active.current = null;
    setStatus('stopped');
  }

  return (
    <section className="ai-panel" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Разбор ответа</h3>
      <p className="ai-panel-label">{feedbackSource.label}</p>
      <p>{feedbackSource.notice}</p>
      <div className="task-actions">
        <button
          ref={action}
          type="button"
          disabled={busy}
          onClick={() => {
            void start();
          }}
        >
          {status === 'idle'
            ? feedbackSource.actionLabel
            : status === 'error'
              ? 'Попробовать ещё раз'
              : 'Повторить разбор'}
        </button>
        {busy && (
          <button type="button" onClick={stop}>
            Остановить разбор
          </button>
        )}
      </div>
      <p role="status">
        {busy
          ? 'Получаем пример разбора…'
          : status === 'done'
            ? 'Пример разбора готов.'
            : status === 'stopped'
              ? 'Разбор остановлен. Можно повторить получение с начала.'
              : ''}
      </p>
      {error && <p role="alert">{error}</p>}
      {html && (
        <div
          className="ai-panel-output"
          role="region"
          aria-label="Текст разбора"
          aria-busy={busy}
          ref={output}
          tabIndex={-1}
        >
          <RichTextView html={html} />
        </div>
      )}
      {html && <p>Демонстрационный ответ. Сверяйся с эталонным решением.</p>}
      {status === 'done' && lessons.length > 0 && (
        <nav
          className="ai-panel-lessons"
          aria-labelledby={`${id}-lessons-title`}
        >
          <h4 id={`${id}-lessons-title`}>
            Материалы по теме задания №{taskNumber}
          </h4>
          <p id={`${id}-lessons-help`}>
            Урок откроется в новой вкладке. Задание и черновик останутся здесь.
          </p>
          <ul>
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <a
                  href={sitePath(lesson.route)}
                  target="_blank"
                  rel="noopener"
                  aria-describedby={`${id}-lessons-help`}
                >
                  {lesson.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
