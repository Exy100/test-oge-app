import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import {
  configureStream,
  recordStreamResult,
  restoreStreamState,
  referenceKey,
  type StreamState,
  type StreamOutcome,
} from '../core/stream';
import { resolveStreamTask } from '../core/stream/catalog';
import {
  defaultStreamFilters,
  nextFilteredStreamTask,
  matchesStreamFilters,
  type StreamFilters as Filters,
  type FilteredStreamResult,
} from '../core/stream/filtered';
import { examConfig } from '../core/exam/exam.config';
import type { TaskNumber } from '../core/types';
import {
  parseStreamQuery,
  streamTaskUrl,
  writeStreamQuery,
} from '../lib/stream-url';
import TaskCard from './tasks/TaskCard';
import StreamFilters from './StreamFilters';
import { useHydrated } from './useHydrated';
import { initialStreamSeed, initialStreamState } from '../lib/stream-start';
import { browserStore } from '../core/storage/browser';
import {
  withStreamProgress,
  recordStoredResult,
  saveStreamProgress,
} from '../core/stream/progress';
import StreamProgress from './StreamProgress';
import { useStoredAreas } from './useStoredAreas';

function preset(filters: Filters): string {
  if (filters.numbers.length === 1) {
    const number = filters.numbers[0];
    return number === 13
      ? filters.variant13 === 'document'
        ? '13.2'
        : '13.1'
      : String(number);
  }
  if (filters.numbers.join(',') === '1,2,3,4,5,6,7,8,9,10') return 'short';
  return filters.numbers.length === 16 ? 'all' : 'custom';
}
export default function Stream({
  initialHtml,
  topics,
}: {
  initialHtml: string;
  topics: readonly string[];
}) {
  const ready = useHydrated();
  const shortcutsId = useId();
  const [shortcuts, setShortcuts] = useState(true);
  const nextButton = useRef<HTMLButtonElement>(null);
  const stored = useStoredAreas();
  const [state, setState] = useState<StreamState>(initialStreamState);
  const [filters, setFilters] = useState(defaultStreamFilters);
  const [selectionInfo, setSelectionInfo] = useState<
    Omit<FilteredStreamResult, 'state'>
  >({ unavailable: [], waiting: null });
  const [statementHtml, setStatementHtml] = useState(initialHtml);
  const [busy, setBusy] = useState(false);
  const advancing = useRef(false);
  const latest = useRef<StreamState | null>(null);
  const navigation = useRef(0);
  const [outcome, setOutcome] = useState<StreamOutcome | null>(null);
  const resultRecorded = useRef(false);
  const writing = useRef(false);
  const [error, setError] = useState('');
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const task = state.current
    ? resolveStreamTask(state.current.reference)
    : null;

  useEffect(() => {
    const store = browserStore();
    const signature = () =>
      JSON.stringify([store.read('streamStats'), store.read('reviewQueue')]);
    let previous = signature();
    const restored = withStreamProgress(initialStreamState(), store.snapshot());
    latest.current = restored;
    return store.subscribe(() => {
      const next = signature();
      if (next === previous) return;
      previous = next;
      if (writing.current) return;
      // Imports, reset and results from another tab must not be overwritten by
      // an old answer or an asynchronous task transition in this tab.
      navigation.current += 1;
      advancing.current = false;
      setBusy(false);
      const updated = withStreamProgress(
        latest.current ?? initialStreamState(),
        store.snapshot(),
      );
      latest.current = updated;
      setState(updated);
      resultRecorded.current = false;
      setOutcome(null);
      setRevision((value) => value + 1);
      setSelectionInfo((info) => ({ ...info, waiting: null }));
    });
  }, []);

  function acceptResult(result: StreamOutcome) {
    if (resultRecorded.current || !state.current) return;
    try {
      writing.current = true;
      recordStoredResult(
        browserStore(),
        state,
        result,
        new Date().toISOString(),
      );
      resultRecorded.current = true;
      setOutcome(result);
    } catch {
      setError(
        'Не удалось сохранить результат. Экспортируй данные в настройках и освободи место.',
      );
    } finally {
      writing.current = false;
    }
  }

  // A static Pages response cannot read the query. Restore it after hydration;
  // history navigation preserves this tab's statistics and never records an answer.
  useEffect(() => {
    let mounted = true;
    async function restore() {
      const token = ++navigation.current;
      advancing.current = true;
      setBusy(true);
      setError('');
      setReloadNeeded(false);
      try {
        const saved: unknown = window.history.state;
        const savedSearch =
          saved &&
          typeof saved === 'object' &&
          'streamQuery' in saved &&
          typeof saved.streamQuery === 'string'
            ? saved.streamQuery
            : '';
        const query = parseStreamQuery(
          window.location.search || savedSearch,
          topics,
        );
        const base = withStreamProgress(
          latest.current ?? initialStreamState(),
          browserStore().snapshot(),
        );
        const configured = configureStream(
          { ...base, current: null },
          query.filters,
        );
        const reference = query.reference;
        const review =
          reference &&
          configured.reviews.find(
            (entry) =>
              entry.dueAfter === 0 &&
              referenceKey(entry) === referenceKey(reference),
          );
        const selected = query.reference
          ? {
              state: restoreStreamState({
                ...configured,
                draws: Math.max(1, configured.draws),
                current: review
                  ? {
                      kind: 'review',
                      reference: query.reference,
                      step: review.step,
                    }
                  : { kind: 'random', reference: query.reference },
              }),
              unavailable: [],
              waiting: null,
            }
          : nextFilteredStreamTask(configured, query.filters);
        const { renderRichText } = await import('../core/rich-text/render');
        const html = selected.state.current
          ? renderRichText(
              resolveStreamTask(selected.state.current.reference).statement,
            )
          : '';
        if (!mounted || token !== navigation.current) return;
        latest.current = selected.state;
        setState(selected.state);
        setFilters(query.filters);
        setSelectionInfo(selected);
        setStatementHtml(html);
        setOutcome(null);
        resultRecorded.current = false;
        setCopyStatus('');
        setManualLink('');
        setRevision((value) => value + 1);
      } catch {
        if (mounted && token === navigation.current)
          setError(
            'Не удалось открыть ссылку. Проверь задание, seed и фильтры или выбери задания заново.',
          );
      } finally {
        if (mounted && token === navigation.current) {
          advancing.current = false;
          setBusy(false);
        }
      }
    }
    if (window.location.search) void restore();
    const onPopState = () => {
      void restore();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      mounted = false;
      navigation.current += 1;
      window.removeEventListener('popstate', onPopState);
    };
  }, [topics]);

  async function advance(selection?: Filters) {
    if (advancing.current) return;
    advancing.current = true;
    const token = ++navigation.current;
    setBusy(true);
    setError('');
    setReloadNeeded(false);
    try {
      const active = withStreamProgress(
        {
          ...state,
          current: resultRecorded.current ? null : state.current,
          seed:
            state.seed === initialStreamSeed || !state.current
              ? crypto.randomUUID()
              : state.seed,
        },
        browserStore().snapshot(),
      );
      const keepCurrent =
        selection &&
        !outcome &&
        task &&
        matchesStreamFilters(task, selection) &&
        (!selection.reviewOnly || state.current?.kind === 'review');
      const completed =
        active.current && !keepCurrent
          ? recordStreamResult(active, outcome ?? { kind: 'skip' })
          : active;
      const nextFilters = selection ?? filters;
      const configured = configureStream(completed, nextFilters);
      if (keepCurrent) configured.current = active.current;
      const selected = nextFilteredStreamTask(configured, nextFilters);
      const { renderRichText } = await import('../core/rich-text/render');
      const html = selected.state.current
        ? renderRichText(
            resolveStreamTask(selected.state.current.reference).statement,
          )
        : '';
      if (token !== navigation.current) return;
      const url = streamTaskUrl(window.location.href, {
        filters: nextFilters,
        reference: selected.state.current?.reference ?? null,
      });
      // Commit history before React state so a failed load leaves everything intact.
      if (selection) {
        if (!window.location.search)
          window.history.replaceState(
            {
              streamQuery: writeStreamQuery({
                filters,
                reference: state.current?.reference ?? null,
              }),
            },
            '',
            window.location.href,
          );
        window.history.pushState(null, '', url);
      } else window.history.replaceState(null, '', url);
      if (active.current && !keepCurrent) {
        writing.current = true;
        try {
          saveStreamProgress(
            browserStore(),
            selected.state,
            { kind: 'skip' },
            active.current.reference.taskNumber,
            new Date().toISOString(),
          );
        } finally {
          writing.current = false;
        }
      }
      latest.current = selected.state;
      setState(selected.state);
      setFilters(nextFilters);
      setSelectionInfo(selected);
      setStatementHtml(html);
      setOutcome(null);
      resultRecorded.current = false;
      setCopyStatus('');
      setManualLink('');
      if (!keepCurrent) setRevision((value) => value + 1);
      heading.current?.focus();
    } catch {
      if (token === navigation.current) {
        setError('Не удалось подготовить задание. Попробуй ещё раз.');
        setReloadNeeded(true);
      }
    } finally {
      if (token === navigation.current) {
        advancing.current = false;
        setBusy(false);
      }
    }
  }
  async function copyLink() {
    if (!state.current) return;
    const token = navigation.current;
    const url = streamTaskUrl(window.location.href, {
      filters,
      reference: state.current.reference,
    });
    try {
      await navigator.clipboard.writeText(url);
      if (token === navigation.current) {
        setCopyStatus('Ссылка скопирована.');
        setManualLink('');
      }
    } catch {
      if (token === navigation.current) {
        setCopyStatus('Скопируй ссылку из поля ниже.');
        setManualLink(url);
      }
    }
  }
  function quickSelect(value: string) {
    if (value === 'custom') return;
    const numbers =
      value === 'short'
        ? defaultStreamFilters().numbers
        : value === 'all'
          ? Object.keys(examConfig.tasks).map(
              (number) => Number(number) as TaskNumber,
            )
          : [Number(value.split('.')[0]) as TaskNumber];
    void advance({
      ...filters,
      numbers,
      variant13: value.startsWith('13.')
        ? value === '13.2'
          ? 'document'
          : 'presentation'
        : filters.variant13,
    });
  }
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      !ready ||
      busy ||
      advancing.current ||
      !shortcuts ||
      !state.current ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !['n', 'т', 'arrowright'].includes(event.key.toLowerCase())
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target !== nextButton.current &&
      target.closest(
        'input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="dialog"], [role="tablist"], pre, .katex',
      )
    )
      return;
    event.preventDefault();
    void advance();
  });
  useEffect(() => {
    window.addEventListener('keydown', onShortcut);
    return () => {
      window.removeEventListener('keydown', onShortcut);
    };
  }, []);
  return (
    <div className="stream">
      <p>
        Выбери номера и решай в своём темпе. При смене задания код и черновик
        очищаются — скачай нужное заранее. Результаты и очередь повторений
        сохраняются в этом браузере сразу после оценки.
      </p>
      <label className="stream-shortcuts">
        <input
          type="checkbox"
          checked={shortcuts}
          disabled={!ready}
          aria-describedby={shortcutsId}
          onChange={(event) => {
            setShortcuts(event.target.checked);
          }}
        />
        Горячие клавиши N и →
      </label>
      <p id={shortcutsId}>
        Enter в поле ответа — проверить. N (Т в русской раскладке) или → —
        следующее задание, без ответа — пропустить. Клавиши перехода работают
        вне полей, редакторов и фильтров. Их можно отключить на этой странице.
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
            value={preset(filters)}
            onChange={(event) => {
              quickSelect(event.target.value);
            }}
          >
            <option value="short">Поток №1–10</option>
            <option value="all">Все номера №1–16</option>
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
            {preset(filters) === 'custom' && (
              <option value="custom">
                Выбранные номера: {filters.numbers.join(', ')}
              </option>
            )}
          </select>
        </label>
        <details className="stream-filters">
          <summary>Фильтры заданий</summary>
          <StreamFilters
            key={JSON.stringify(filters)}
            filters={filters}
            topics={topics}
            onApply={(value) => {
              void advance(value);
            }}
          />
        </details>
        <p className="stream-filter-summary">
          Номера: {filters.numbers.join(', ')} · {filters.topic || 'Все темы'} ·{' '}
          {filters.difficulty
            ? `Сложность ${String(filters.difficulty)} из 3`
            : 'Любая сложность'}
          {filters.reviewOnly ? ' · Только повторение ошибок' : ''}
        </p>
        {selectionInfo.unavailable.length > 0 && (
          <p>
            Для №{selectionInfo.unavailable.join(', №')} не подобраны задания с
            этими фильтрами.{' '}
            {task
              ? 'В потоке участвуют остальные выбранные номера.'
              : 'Измени фильтры или повтори подбор.'}
          </p>
        )}
        <h2 className="stream-position" ref={heading} tabIndex={-1}>
          Задание {stored.streamStats.completed + (outcome ? 0 : 1)}
          {state.current?.kind === 'review' ? ' · повторение' : ''}
        </h2>
        {task ? (
          <>
            <button
              className="button button-light"
              type="button"
              onClick={() => {
                void copyLink();
              }}
            >
              Скопировать ссылку на задачу
            </button>
            <TaskCard
              key={revision}
              task={task}
              statementHtml={statementHtml}
              onResult={acceptResult}
            />
          </>
        ) : (
          <p className="stream-empty" role="status">
            {filters.reviewOnly
              ? selectionInfo.waiting === null
                ? 'В сохранённой очереди нет ошибок, подходящих под фильтры. Выключи повторение ошибок, чтобы решать новые задания.'
                : `Повторение запланировано после ещё ${String(selectionInfo.waiting)} других заданий. Выключи повторение ошибок и продолжи тренировку.`
              : 'Не удалось подобрать задание. Попробуй другие фильтры или повтори подбор.'}
          </p>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {reloadNeeded && (
              <>
                <p>
                  Проверь соединение. Если ошибка повторяется, скопируй черновик
                  и скачай свой код перед перезагрузкой.{' '}
                  {browserStore().memoryOnly
                    ? 'Хранилище недоступно: при перезагрузке возможна потеря результатов этой страницы.'
                    : 'Сохранённые результаты останутся в этом браузере.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Перезагрузить страницу
                </button>
              </>
            )}
          </div>
        )}
        <button
          ref={nextButton}
          aria-keyshortcuts={shortcuts && task ? 'n т ArrowRight' : undefined}
          className="button button-dark"
          type="button"
          onClick={() => {
            void advance();
          }}
        >
          {!task
            ? 'Повторить подбор'
            : outcome
              ? 'Следующее задание'
              : 'Пропустить задание'}
        </button>
      </fieldset>
      <p role="status">{busy ? 'Подготавливаем задание…' : copyStatus}</p>
      {manualLink && (
        <label>
          Ссылка на задачу
          <input
            className="stream-link"
            type="text"
            readOnly
            value={manualLink}
            onFocus={(event) => {
              event.target.select();
            }}
          />
        </label>
      )}
      <StreamProgress />
    </div>
  );
}
