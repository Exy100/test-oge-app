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
  const action = useAiAction<string>('variant-summary');
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
          ref={action.button}
          disabled={action.busy}
          onClick={() => {
            void action.start((signal, update) =>
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
          {action.status === 'error'
            ? 'Повторить сводку с ИИ'
            : 'Составить план с ИИ'}
        </button>
        {action.busy && (
          <button type="button" onClick={action.stop}>
            Остановить сводку
          </button>
        )}
      </div>
      <p role="status">
        {action.busy
          ? 'Получаем сводку…'
          : action.status === 'done'
            ? 'Сводка готова.'
            : action.status === 'stopped'
              ? 'Сводка остановлена.'
              : ''}
      </p>
      {action.error && <p role="alert">{action.error}</p>}
      {action.value && (
        <div
          className="ai-panel-output"
          ref={action.output}
          tabIndex={-1}
          role="region"
          aria-label="Текст сводки ИИ"
          aria-busy={action.busy}
        >
          <RichTextView html={action.value} />
        </div>
      )}
      {action.value && <p>ИИ может ошибаться. Сверяйся с эталонным решением</p>}
      <AiConsent
        open={action.status === 'consent'}
        button={action.button}
        close={action.close}
        confirm={action.confirm}
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
