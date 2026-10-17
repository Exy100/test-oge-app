import { useRef, useState } from 'react';
import {
  configureStream,
  nextStreamTask,
  recordStreamResult,
  type StreamOutcome,
} from '../core/stream';
import { resolveStreamTask } from '../core/stream/catalog';
import { examConfig } from '../core/exam/exam.config';
import type { TaskNumber } from '../core/types';
import TaskCard from './tasks/TaskCard';
import { useHydrated } from './useHydrated';
import { initialStreamSeed, initialStreamState } from '../lib/stream-start';

export default function Stream({ initialHtml }: { initialHtml: string }) {
  const ready = useHydrated();
  const [state, setState] = useState(initialStreamState);
  const [statementHtml, setStatementHtml] = useState(initialHtml);
  const [busy, setBusy] = useState(false);
  const advancing = useRef(false);
  const [selection, setSelection] = useState('short');
  const [outcome, setOutcome] = useState<StreamOutcome | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const task = resolveStreamTask(state.current.reference);
  // The first card is static HTML. Randomize future draws on the first action,
  // preserving the visible task, its result and the engine's review queue.
  function stateForAction() {
    return state.seed === initialStreamSeed
      ? { ...state, seed: crypto.randomUUID() }
      : state;
  }
  async function advance(value?: string) {
    if (advancing.current) return;
    advancing.current = true;
    setBusy(true);
    setError('');
    try {
      const completed = recordStreamResult(
        stateForAction(),
        outcome ?? { kind: 'skip' },
      );
      let configured = completed;
      if (value !== undefined) {
        const numbers: TaskNumber[] =
          value === 'short'
            ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            : [Number(value.split('.')[0]) as TaskNumber];
        configured = configureStream(completed, {
          numbers,
          variant13: value === '13.2' ? 'document' : 'presentation',
        });
      }
      const next = nextStreamTask(configured);
      const { renderRichText } = await import('../core/rich-text/render');
      const html = renderRichText(
        resolveStreamTask(next.current.reference).statement,
      );
      setState(next);
      setStatementHtml(html);
      if (value !== undefined) setSelection(value);
      setOutcome(null);
      setRevision((value) => value + 1);
      if (value === undefined) heading.current?.focus();
    } catch {
      setError('Не удалось подготовить задание. Попробуй ещё раз.');
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="stream">
      <p>
        Выбери номер и решай в своём темпе. При смене задания код и черновик
        очищаются — скачай нужное заранее. Результаты этой сессии учитываются до
        перезагрузки.
      </p>
      <fieldset
        className="stream-controls"
        disabled={!ready || busy}
        aria-busy={busy}
      >
        <legend className="ui-sr-only">Задания и ответы</legend>
        <label>
          Что решать
          <select
            value={selection}
            onChange={(event) => {
              void advance(event.target.value);
            }}
          >
            <option value="short">Поток №1–10</option>
            {Object.entries(examConfig.tasks).flatMap(([number, rule]) =>
              number === '13'
                ? [
                    <option key="13.1" value="13.1">
                      №13.1 — презентация
                    </option>,
                    <option key="13.2" value="13.2">
                      №13.2 — документ
                    </option>,
                  ]
                : [
                    <option key={number} value={number}>
                      №{number} — {rule.skill}
                    </option>,
                  ],
            )}
          </select>
        </label>
        <h2 className="stream-position" ref={heading} tabIndex={-1}>
          Задание {state.completed + 1}
          {state.current.kind === 'review' ? ' · повторение' : ''}
        </h2>
        <TaskCard
          key={revision}
          task={task}
          statementHtml={statementHtml}
          onResult={setOutcome}
        />
        {error && <p role="alert">{error}</p>}
        <button
          className="button button-dark"
          type="button"
          onClick={() => {
            void advance();
          }}
        >
          {outcome ? 'Следующее задание' : 'Пропустить задание'}
        </button>
      </fieldset>
      <p role="status">{busy ? 'Подготавливаем задание…' : ''}</p>
    </div>
  );
}
