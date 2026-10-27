import { useEffect, useMemo, useRef, useState } from 'react';
import {
  examClock,
  type ExamAttempt,
  type ExamDraft,
} from '../../core/variants/exam';
import { scoreAttempt, saveAttemptResult } from '../../core/variants/result';
import type { TaskInstance, Score, Variant } from '../../core/types';
import { browserStore } from '../../core/storage/browser';
import { sitePath } from '../../lib/site';
import {
  attemptResultHref,
  attemptVariantLabel,
  recoverResultPage,
} from '../../lib/variant-links';
import { useStoredAreas } from '../useStoredAreas';
import { Button } from '../ui/Button';
import VariantFiles from './VariantFiles';
import ResultSummary from './ResultSummary';
import ResultPlan from './ResultPlan';
import '../../styles/result.css';

import { useResultVariant } from './useResultVariant';
import printUrl from './ResultPrint.tsx?module-url';
import taskBodyUrl from './ResultTaskBody.tsx?module-url';
import { importFreshModule } from '../../lib/fresh-module';
export function ExamDownload({ draft }: { draft: ExamDraft }) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(draft, null, 2) + '\n'], {
            type: 'application/json',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `oge-answers-${draft.id}.json`;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      }}
    >
      Скачать мои ответы
    </Button>
  );
}

function ReviewTask({
  task,
  attempt,
  disabled,
  onAssess,
}: {
  task: TaskInstance;
  attempt: ExamAttempt;
  disabled: boolean;
  onAssess: (number: 13 | 14 | 15 | 16, score: Score | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [Body, setBody] = useState<
    (typeof import('./ResultTaskBody'))['default'] | null
  >(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const summary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (Body && retry > 0) summary.current?.focus();
  }, [Body, retry]);
  useEffect(() => {
    if (!open || Body) return;
    let current = true;
    void importFreshModule<typeof import('./ResultTaskBody')>(taskBodyUrl)
      .then((module) => {
        if (current) setBody(() => module.default);
      })
      .catch(() => {
        if (current)
          setError(
            'Не удалось открыть задание. Твои ответы и самооценки сохранены.',
          );
      });
    return () => {
      current = false;
    };
  }, [open, Body, retry]);
  const number = task.taskNumber;
  return (
    <details
      className="variant-task"
      id={`result-task-${String(number)}`}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        setError('');
      }}
    >
      <summary ref={summary}>
        <h3>
          Задание №{number}
          {task.variant13 === 'presentation'
            ? '.1'
            : task.variant13 === 'document'
              ? '.2'
              : ''}
        </h3>
      </summary>
      {open && (
        <div className="variant-task-body">
          {Body ? (
            <Body
              task={task}
              attempt={attempt}
              disabled={disabled}
              onAssess={onAssess}
            />
          ) : error ? (
            <>
              <p role="alert">{error}</p>
              <Button
                onClick={() => {
                  setError('');
                  setRetry((value) => value + 1);
                }}
              >
                Повторить загрузку задания
              </Button>
            </>
          ) : (
            <p role="status">Открываем условие и критерии…</p>
          )}
        </div>
      )}
    </details>
  );
}

type PrintView = (typeof import('./ResultPrint'))['default'];
export default function ExamFinished({
  attempt,
  notice = '',
  verifiedVariant,
}: {
  attempt: ExamAttempt;
  notice?: string;
  verifiedVariant?: Variant;
}) {
  const areas = useStoredAreas();
  const saved = areas.variantAttempts.entries.find(
    (row) => row.id === attempt.id,
  );
  const current = saved ?? attempt;
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [Print, setPrint] = useState<PrintView | null>(null);
  const [busy, setBusy] = useState(false);
  const [printFailed, setPrintFailed] = useState(false);
  const printButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (Print || printFailed) printButton.current?.focus();
  }, [Print, printFailed]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const rebuilt = useResultVariant(current, verifiedVariant);
  const resultReady = rebuilt.variant !== null;
  useEffect(() => {
    heading.current?.focus();
  }, [resultReady]);
  const scored = useMemo(() => {
    if (!rebuilt.variant) return null;
    try {
      return scoreAttempt(rebuilt.variant, current);
    } catch {
      return null;
    }
  }, [rebuilt, current]);
  useEffect(() => {
    const variant = rebuilt.variant;
    if (!variant || !saved || !scored || saved.score === scored.primaryScore)
      return;
    let active = true;
    // Persist the derived total outside render; cancel if this review changes first.
    queueMicrotask(() => {
      if (!active) return;
      try {
        saveAttemptResult(browserStore(), saved, variant);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить результат.',
        );
      }
    });
    return () => {
      active = false;
    };
  }, [saved, scored, rebuilt]);
  if (!rebuilt.variant || !scored)
    return (
      <section
        className="exam-finished result-loading"
        aria-labelledby="exam-finished-title"
      >
        <h2 id="exam-finished-title" ref={heading} tabIndex={-1}>
          {current.mode === 'training'
            ? 'Тренировка завершена'
            : 'Экзамен завершён'}
        </h2>
        <p role={rebuilt.error || rebuilt.variant ? 'alert' : 'status'}>
          {rebuilt.error ||
            (rebuilt.variant
              ? 'Не удалось рассчитать результат: проверь сохранённые оценки.'
              : 'Готовим сохранённые ответы и разбор…')}
        </p>
        <ExamDownload draft={current} />
        {rebuilt.error && (
          <Button
            variant="secondary"
            onClick={() => {
              recoverResultPage();
            }}
          >
            Повторить восстановление
          </Button>
        )}
        <a href={sitePath('/variants/')}>Все варианты и история</a>
      </section>
    );
  const variant = rebuilt.variant;
  const result = scored;
  const href = attemptResultHref(current);
  function assess(taskNumber: 13 | 14 | 15 | 16, score: Score | null) {
    try {
      saveAttemptResult(browserStore(), current, variant, {
        taskNumber,
        score,
      });
      setError('');
      setMessage(
        score === null
          ? `Оценка №${String(taskNumber)} снята.`
          : `Самооценка №${String(taskNumber)} сохранена: ${String(score)}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось сохранить самооценку.',
      );
    }
  }
  async function preparePrint() {
    setBusy(true);
    setError('');
    try {
      const module =
        await importFreshModule<typeof import('./ResultPrint')>(printUrl);
      if (alive.current) setPrint(() => module.default);
    } catch {
      if (alive.current) {
        setPrintFailed(true);
        setError(
          'Не удалось подготовить разбор к печати. Перезагрузи страницу и подготовь его ещё раз: ответы останутся в истории.',
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className={`exam-finished variant-result${Print ? ' result-print-ready' : ''}`}
      aria-labelledby="exam-finished-title"
    >
      <p className="result-print-notice">
        Печатается краткая сводка. Для условий и разборов всех 16 номеров закрой
        печать и нажми «Подготовить результат к печати» на странице результата.
      </p>
      <div className="result-screen">
        <h2 ref={heading} id="exam-finished-title" tabIndex={-1}>
          {current.mode === 'training'
            ? 'Тренировка завершена'
            : 'Экзамен завершён'}
        </h2>
        <p>
          {attemptVariantLabel(current)} · работа №
          {current.variant13 === 'presentation' ? '13.1' : '13.2'}.
        </p>
        <p>
          {current.mode === 'exam' && (
            <>Время работы: {examClock(current.elapsedMs)}. </>
          )}
          Ответы больше не изменяются. Самооценку практики можно уточнять по
          критериям.
        </p>
        <div aria-live="polite" aria-atomic="true">
          <ResultSummary result={result} />
        </div>
        {notice && <p role="alert">{notice}</p>}
        {!saved && (
          <p role="alert">
            Этой попытки нет в истории. Скачай ответы, чтобы сохранить их;
            самооценка здесь недоступна.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <p role="status">{message}</p>
        <div className="task-actions result-controls">
          <ExamDownload draft={current} />
          {href && <a href={href}>Открыть страницу результата</a>}
          <a href={sitePath('/variants/')}>Все варианты и история</a>
        </div>
        <h3>Баллы по заданиям</h3>
        <div
          className="variant-history-scroll"
          role="region"
          aria-label="Таблица результатов 16 заданий"
          tabIndex={0}
        >
          <table className="variant-history-table result-table">
            <thead>
              <tr>
                <th scope="col">Номер</th>
                <th scope="col">Твой ответ или работа</th>
                <th scope="col">Баллы</th>
                <th scope="col">Разбор</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const answer = current.answers.find(
                  (answer) => answer.taskNumber === row.taskNumber,
                )?.text;
                return (
                  <tr key={row.taskId}>
                    <th scope="row">
                      №{row.taskNumber}
                      {row.taskNumber === 13
                        ? current.variant13 === 'presentation'
                          ? '.1'
                          : '.2'
                        : ''}
                    </th>
                    <td>
                      {answer
                        ? answer.length > 100
                          ? answer.slice(0, 100) + '…'
                          : answer
                        : 'Нет записи'}
                      {row.kind === 'practice' && row.source && (
                        <span className="variant-history-kind">
                          {row.source === 'self'
                            ? 'Самооценка'
                            : 'Принятое предложение ИИ'}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.score === null
                        ? 'Не оценено'
                        : `${String(row.score)} из ${String(row.maxScore)}`}
                    </td>
                    <td>
                      <a
                        href={`#result-task-${String(row.taskNumber)}`}
                        onClick={(event) => {
                          const details = document.getElementById(
                            `result-task-${String(row.taskNumber)}`,
                          );
                          if (details instanceof HTMLDetailsElement) {
                            event.preventDefault();
                            details.open = true;
                            window.history.replaceState(
                              null,
                              '',
                              `#${details.id}`,
                            );
                            details.scrollIntoView();
                            details.querySelector('summary')?.focus();
                          }
                        }}
                      >
                        Разбор №{row.taskNumber}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ResultPlan result={result} variant13={current.variant13} />
        <VariantFiles variantId={current.variantId} seed={current.seed} />
        <h3>Ответы и разбор</h3>
        <p>
          Открой номер, сравни работу с решением и выбери балл по критериям
          №13–16. Отсутствие оценки и выбранные 0 баллов учитываются по-разному.
        </p>
        {variant.tasks.map((task) => (
          <ReviewTask
            key={task.id}
            task={task}
            attempt={current}
            disabled={!saved}
            onAssess={assess}
          />
        ))}
        <div className="result-controls">
          <h3>Печать результата</h3>
          <p>
            Полная печатная версия включает итог, твои записи, условия, решения
            и критерии всех 16 номеров. Подготовь её, затем сохрани в PDF или
            распечатай на A4.
          </p>
          {Print ? (
            <>
              <p role="status">Все 16 разборов подготовлены к печати.</p>
              <Button
                ref={printButton}
                onClick={() => {
                  window.print();
                }}
              >
                Печатать результат
              </Button>
            </>
          ) : printFailed ? (
            <Button
              ref={printButton}
              onClick={() => {
                recoverResultPage();
              }}
            >
              Перезагрузить для печати
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() => {
                void preparePrint();
              }}
            >
              {busy ? 'Готовим разбор…' : 'Подготовить результат к печати'}
            </Button>
          )}
        </div>
      </div>
      {Print && <Print variant={variant} attempt={current} result={result} />}
    </section>
  );
}
