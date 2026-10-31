import { browserCache } from '../../core/storage/browser';
import type { SummaryRequest } from '../../lib/ai/summary-contract';
import { createApiSummaryProvider } from '../../lib/ai/api-provider';
import { consumeCachedSummary } from '../../lib/ai/feedback';
import RichTextView from '../RichTextView';
import { useAiAction } from './useAiAction';
import AiConsent from './AiConsent';
import '../../styles/task-card.css';

export default function AiSummaryPanel({
  request,
}: {
  request: SummaryRequest;
}) {
  return <Summary key={JSON.stringify(request)} request={request} />;
}
function Summary({ request }: { request: SummaryRequest }) {
  const {
    value,
    status,
    error: requestError,
    button,
    output,
    start,
    confirm,
    close,
    stop,
    busy,
  } = useAiAction<string>('variant-summary');
  return (
    <section
      className="ai-panel ai-summary task-card"
      aria-label="Сводка результата с ИИ"
    >
      <h3>Сводка и план подготовки с ИИ</h3>
      <p>
        Будут отправлены только номера заданий, баллы и самооценки. Тексты
        ответов, код и файлы не отправляются. Время каждого задания не
        измерялось. Баллы практики — учебная самооценка или принятые предложения
        ИИ.
      </p>
      <div className="task-actions">
        <button
          type="button"
          ref={button}
          disabled={busy}
          onClick={() => {
            void start((signal, update) =>
              consumeCachedSummary(
                createApiSummaryProvider(),
                request,
                signal,
                update,
                browserCache(),
              ),
            );
          }}
        >
          {status === 'error' ? 'Повторить сводку с ИИ' : 'Составить план с ИИ'}
        </button>
        {busy && (
          <button type="button" onClick={stop}>
            Остановить сводку
          </button>
        )}
      </div>
      <p role="status">
        {busy
          ? 'Получаем сводку…'
          : status === 'done'
            ? 'Сводка готова.'
            : status === 'stopped'
              ? 'Сводка остановлена.'
              : ''}
      </p>
      {requestError && <p role="alert">{requestError}</p>}
      {value && (
        <div
          className="ai-panel-output"
          ref={output}
          tabIndex={-1}
          role="region"
          aria-label="Текст сводки ИИ"
          aria-busy={busy}
        >
          <RichTextView html={value} />
        </div>
      )}
      {value && <p>ИИ может ошибаться. Сверяйся с эталонным решением</p>}
      <AiConsent
        open={status === 'consent'}
        button={button}
        close={close}
        confirm={confirm}
      >
        <p>
          Будут отправлены следующие агрегаты. null означает отсутствие оценки
          или измерения времени.
        </p>
        <pre>
          {JSON.stringify(
            { results: request.results, part2Self: request.part2Self },
            null,
            2,
          )}
        </pre>
      </AiConsent>
    </section>
  );
}
