import { useEffect, useId, useRef, useState } from 'react';
import type { TaskInstance } from '../../core/types';
import RichTextView from '../RichTextView';

interface RevealedGuidance {
  hints: string[];
  steps: string[];
  latest: 'hint' | 'solution' | null;
}
export default function TaskGuidance({ task }: { task: TaskInstance }) {
  const id = useId();
  const [content, setContent] = useState<RevealedGuidance>({
    hints: [],
    steps: [],
    latest: null,
  });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const hintFocus = useRef<HTMLLIElement>(null);
  const solutionFocus = useRef<HTMLLIElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (content.latest)
      (content.latest === 'hint' ? hintFocus : solutionFocus).current?.focus();
  }, [content]);

  async function reveal(kind: 'hint' | 'solution') {
    if (pending.current) return;
    const index = kind === 'hint' ? content.hints.length : content.steps.length;
    const limit = kind === 'hint' ? task.hints.length : task.solution.length;
    if (index >= limit) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const { renderTaskGuidance } = await import('../../lib/task-guidance');
      const html = renderTaskGuidance(task, kind, index);
      if (!mounted.current) return;
      setContent({
        hints: kind === 'hint' ? [...content.hints, html] : content.hints,
        steps: kind === 'solution' ? [...content.steps, html] : content.steps,
        latest: kind,
      });
    } catch {
      if (mounted.current)
        setError(
          'Не удалось открыть помощь. Попробуй ещё раз — твой ответ и черновик сохранены.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="task-guidance"
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <h3 id={`${id}-title`}>Помощь с заданием</h3>
      <p>
        Попробуй решить сам. Подсказки и решение можно открывать по одному шагу;
        ответ и черновик сохранятся.
      </p>
      <div className="task-actions">
        <button
          type="button"
          disabled={busy || content.hints.length === task.hints.length}
          aria-expanded={content.hints.length > 0}
          aria-controls={`${id}-hints`}
          onClick={() => {
            void reveal('hint');
          }}
        >
          {content.hints.length === 3
            ? 'Все подсказки открыты'
            : `Открыть подсказку ${String(content.hints.length + 1)} из 3`}
        </button>
        <button
          type="button"
          disabled={busy || content.steps.length === task.solution.length}
          aria-expanded={content.steps.length > 0}
          aria-controls={`${id}-solution`}
          onClick={() => {
            void reveal('solution');
          }}
        >
          {content.steps.length === task.solution.length
            ? 'Решение открыто полностью'
            : content.steps.length === 0
              ? 'Показать решение по шагам'
              : 'Следующий шаг решения'}
        </button>
      </div>
      <div id={`${id}-hints`} hidden={content.hints.length === 0}>
        <h4>Подсказки</h4>
        <ol className="task-guidance-list">
          {content.hints.map((html, index) => (
            <li
              className="task-reveal"
              key={index}
              tabIndex={-1}
              ref={index === content.hints.length - 1 ? hintFocus : null}
            >
              <h5>Подсказка {index + 1} из 3</h5>
              <RichTextView html={html} />
            </li>
          ))}
        </ol>
      </div>
      <div id={`${id}-solution`} hidden={content.steps.length === 0}>
        <h4>Решение по шагам</h4>
        <ol className="task-guidance-list">
          {content.steps.map((html, index) => (
            <li
              className="task-reveal"
              key={index}
              tabIndex={-1}
              ref={index === content.steps.length - 1 ? solutionFocus : null}
            >
              <h5>
                Шаг {index + 1} из {task.solution.length}
              </h5>
              <RichTextView html={html} />
            </li>
          ))}
        </ol>
      </div>
      {task.commonMistakes.length > 0 && (
        <details className="task-guidance-mistakes">
          <summary>Типичные ошибки</summary>
          <ul>
            {task.commonMistakes.map((mistake, index) => (
              <li key={index}>{mistake.explanation}</li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Открываем помощь…' : ''}</p>
    </section>
  );
}
