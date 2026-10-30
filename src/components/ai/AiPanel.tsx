import { useEffect, useId, useRef, useState } from 'react';
import type { FeedbackProvider, FeedbackRequest } from '../../lib/ai/contract';
import { feedbackSource, loadFeedbackProvider } from '../../lib/ai/provider';
import RichTextView from '../RichTextView';
import feedbackUrl from '../../lib/ai/feedback.ts?module-url';
import { importFreshModule } from '../../lib/fresh-module';
import { preparationLessons } from '../../lib/lessons/preparation';
import { sitePath } from '../../lib/site';
import { lessonStreamHref } from '../../lib/lessons/links';
import { browserCache, browserStore } from '../../core/storage/browser';
import { hasAiConsent, grantAiConsent } from '../../lib/ai/consent';
import { Modal } from '../ui/Modal';
import '../../styles/task-card.css';

type Status =
  'idle' | 'consent' | 'loading' | 'streaming' | 'done' | 'stopped' | 'error';
interface Props {
  request: FeedbackRequest;
  taskNumber: number;
  api?: { load: () => Promise<FeedbackProvider> };
}

export default function AiPanel(props: Props) {
  return (
    <Panel
      key={JSON.stringify([
        Boolean(props.api),
        props.taskNumber,
        props.request,
      ])}
      {...props}
    />
  );
}

function Panel({ request, taskNumber, api }: Props) {
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
    if (!api) return;
    return browserStore().subscribe(() => {
      if (hasAiConsent(browserStore())) return;
      active.current?.abort();
      active.current = null;
      browserCache().clear();
      setHtml('');
      setError('');
      setStatus('idle');
    });
  }, [api]);
  useEffect(() => {
    if (status === 'done') output.current?.focus();
    else if (status === 'stopped' || status === 'error')
      action.current?.focus();
  }, [status]);

  async function start() {
    if (active.current) return;
    if (api && !hasAiConsent(browserStore())) {
      setStatus('consent');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setStatus('loading');
    setHtml('');
    setError('');
    let describeError: (error: unknown) => string = () =>
      'Не удалось открыть разбор. Попробуй ещё раз — твой ответ и черновик сохранены.';
    try {
      const [provider, feedback] = await Promise.all([
        api ? api.load() : loadFeedbackProvider(),
        importFreshModule<typeof import('../../lib/ai/feedback')>(feedbackUrl),
      ]);
      if (controller.signal.aborted) return;
      describeError = feedback.feedbackErrorMessage;
      const update = (next: string) => {
        if (controller.signal.aborted) return;
        setHtml(next);
        setStatus('streaming');
      };
      if (api)
        await feedback.consumeCachedFeedback(
          provider,
          request,
          controller.signal,
          update,
          browserCache(),
        );
      else
        await feedback.consumeFeedback(
          provider,
          request,
          controller.signal,
          update,
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
      <p className="ai-panel-label">
        {api ? 'Разбор с ИИ' : feedbackSource.label}
      </p>
      <p>
        {api
          ? 'Отправка через наш сервер и OpenRouter. Решение и баллы проверяются отдельно от текста ИИ.'
          : feedbackSource.notice}
      </p>
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
            ? api
              ? 'Получить разбор с ИИ'
              : feedbackSource.actionLabel
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
          ? api
            ? 'Получаем разбор…'
            : 'Получаем пример разбора…'
          : status === 'done'
            ? api
              ? 'Разбор готов.'
              : 'Пример разбора готов.'
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
      {html && (
        <p>
          {api
            ? 'ИИ может ошибаться. Сверяйся с эталонным решением'
            : 'Демонстрационный ответ. Сверяйся с эталонным решением.'}
        </p>
      )}
      {api && (
        <Modal
          open={status === 'consent'}
          title="Разрешить разбор с ИИ?"
          returnFocusRef={action}
          onClose={() => {
            setStatus('idle');
          }}
        >
          <p>
            Наш сервер передаст условие задания №{taskNumber}, твой ответ и
            черновик через OpenRouter провайдеру модели. Не пиши личные данные.
          </p>
          <p>Твой ответ:</p>
          <blockquote>{request.answer || 'Ответ не заполнен.'}</blockquote>
          <p>Твой черновик:</p>
          <blockquote>
            {request.reasoning || 'Черновик не заполнен.'}
          </blockquote>
          <p>
            Согласие сохранится в этом браузере. Отозвать его можно в{' '}
            <a href={sitePath('/settings/')}>настройках</a>. Ответы временно
            хранятся в этой вкладке.
          </p>
          <div className="task-actions">
            <button
              type="button"
              onClick={() => {
                try {
                  grantAiConsent(browserStore());
                  void start();
                } catch {
                  setError(
                    'Не удалось сохранить согласие. Ответ не отправлен.',
                  );
                  setStatus('error');
                }
              }}
            >
              Разрешить и отправить
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
              }}
            >
              Не отправлять
            </button>
          </div>
        </Modal>
      )}
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
      {status === 'done' && (
        <nav
          className="ai-panel-practice"
          aria-labelledby={`${id}-practice-title`}
        >
          <h4 id={`${id}-practice-title`}>Практика по заданию №{taskNumber}</h4>
          <p id={`${id}-practice-help`}>
            Поток откроется в новой вкладке с выбранным номером задания. Текущий
            ответ и черновик останутся здесь.
          </p>
          <a
            href={lessonStreamHref([taskNumber])}
            target="_blank"
            rel="noopener"
            aria-describedby={`${id}-practice-help`}
          >
            Решать задания №{taskNumber}
          </a>
        </nav>
      )}
    </section>
  );
}
