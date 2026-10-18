import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { browserStore } from '../../core/storage/browser';
import {
  EXAM_DURATION_MS,
  emptyExamNumbers,
  examClock,
  examNumbers,
  type ExamSession,
} from '../../core/variants/exam';
import type { TaskNumber } from '../../core/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import ExamFinished, { ExamDownload, buildExamVariant } from './ExamFinished';
import ExamTask from './ExamTask';
import '../../styles/task-card.css';

export default function ExamRun({
  session,
  releaseLock,
}: {
  session: ExamSession;
  releaseLock: () => void;
}) {
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.snapshot,
  );
  const { draft, phase } = state;
  const variant = useMemo(
    () =>
      buildExamVariant({
        variantId: draft.variantId,
        seed: draft.seed,
        variant13: draft.variant13,
      }),
    [draft.variantId, draft.seed, draft.variant13],
  );
  const [current, setCurrent] = useState<TaskNumber>(
    () => emptyExamNumbers(draft)[0] ?? 1,
  );
  const [finishOpen, setFinishOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const finishButton = useRef<HTMLButtonElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  useEffect(() => {
    if (phase !== 'running') return;
    const store = browserStore();
    const unsubscribe = store.subscribe(session.checkExternal);
    const ticker = window.setInterval(session.tick, 1000);
    const saver = window.setInterval(session.save, 10_000);
    const visible = () => {
      session.save();
    };
    const leave = (event: BeforeUnloadEvent) => {
      session.save();
      if (session.snapshot().phase === 'running') {
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', visible);
    window.addEventListener('beforeunload', leave);
    session.tick();
    return () => {
      session.save();
      unsubscribe();
      clearInterval(ticker);
      clearInterval(saver);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', visible);
      window.removeEventListener('beforeunload', leave);
    };
  }, [session, phase]);
  useEffect(() => {
    if (phase !== 'running') releaseLock();
    if (phase === 'finished' && state.attempt) {
      const url = new URL(window.location.href);
      url.searchParams.set('exam', state.attempt.id);
      window.history.replaceState(null, '', url);
    }
  }, [phase, releaseLock, state.attempt]);
  if (phase === 'finished' && state.attempt)
    return <ExamFinished attempt={state.attempt} notice={state.notice} />;
  if (phase === 'conflict')
    return (
      <section>
        <h2>Запись в этой вкладке остановлена</h2>
        <p role="alert">{state.notice}</p>
        <ExamDownload draft={draft} />
        <p>Перезагрузи страницу, чтобы открыть сохранённую работу.</p>
      </section>
    );
  const task = variant.tasks.find((row) => row.taskNumber === current);
  if (!task) throw new Error('Задание не найдено в варианте.');
  const answer = draft.answers.find((row) => row.taskNumber === current);
  const empty = emptyExamNumbers(draft);
  const remaining = EXAM_DURATION_MS - draft.elapsedMs;
  const threshold = [120, 90, 60, 30, 10, 5, 1].findLast(
    (minutes) => remaining <= minutes * 60_000,
  );
  const label =
    current === 13 || current === 14
      ? 'Имя файла с твоей работой'
      : current === 15
        ? 'Твоя программа Робота'
        : 'Твоя программа на Python';
  function navigate(number: TaskNumber) {
    session.tick();
    setCurrent(number);
    title.current?.focus();
  }
  return (
    <section className="exam-run" aria-label="Прохождение экзамена">
      <header className="exam-toolbar">
        <p>
          Осталось{' '}
          <span
            className="exam-clock"
            role="timer"
            aria-live="off"
            aria-label="Оставшееся время"
          >
            {examClock(remaining)}
          </span>
        </p>
        <p>
          {16 - empty.length} из 16 с записью · {draft.marked.length} отмечено
        </p>
        <Button
          ref={finishButton}
          variant="secondary"
          onClick={() => {
            session.tick();
            setFinishOpen(true);
          }}
        >
          Завершить экзамен
        </Button>
      </header>
      <p className="ui-sr-only" role="status">
        {threshold
          ? `Осталось не больше ${String(threshold)} минут.`
          : 'Экзамен начался. У тебя 150 минут.'}
      </p>
      <p role="status">
        {state.notice ||
          (browserStore().memoryOnly
            ? 'Ответы хранятся только в памяти этой страницы. Скачай их перед закрытием.'
            : state.dirty
              ? 'Есть изменения. Автосохранение — каждые 10 секунд.'
              : 'Ответы сохранены в этом браузере.')}
      </p>
      <nav className="exam-navigation" aria-label="Задания экзамена">
        {examNumbers.map((number) => (
          <button
            type="button"
            key={number}
            aria-current={current === number ? 'step' : undefined}
            data-filled={!empty.includes(number)}
            aria-label={`Задание №${String(number)}${empty.includes(number) ? ', нет записи' : ', есть запись'}${draft.marked.includes(number) ? ', отмечено для возврата' : ''}`}
            onClick={() => {
              navigate(number);
            }}
          >
            {number}
            {draft.marked.includes(number) && (
              <span aria-hidden="true"> ⚑</span>
            )}
          </button>
        ))}
      </nav>
      <p className="exam-legend">
        Зелёный фон — есть запись. ⚑ — вернуться к заданию. Для работ №13–14
        запись имени файла не заменяет сохранение самого файла.
      </p>
      <article
        className="task-card exam-task"
        aria-labelledby="exam-task-title"
      >
        <h2 id="exam-task-title" ref={title} tabIndex={-1}>
          Задание №{current}
          {task.variant13 === 'presentation'
            ? '.1 — презентация'
            : task.variant13 === 'document'
              ? '.2 — документ'
              : ''}
        </h2>
        <Button
          variant="secondary"
          aria-pressed={draft.marked.includes(current)}
          onClick={() => {
            session.mark(current);
          }}
        >
          {draft.marked.includes(current)
            ? 'Снять отметку'
            : 'Отметить для возврата'}
        </Button>
        {current === 13 && (
          <p>
            <Button
              ref={changeButton}
              variant="secondary"
              onClick={() => {
                setChangeOpen(true);
              }}
            >
              Сменить работу №13
            </Button>
          </p>
        )}
        <ExamTask key={task.id} task={task} />
        <label htmlFor="exam-answer">
          {current <= 12 ? 'Твой ответ' : label}
        </label>
        {current <= 12 ? (
          <input
            id="exam-answer"
            type="text"
            value={answer?.text ?? ''}
            maxLength={1000}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => {
              session.answer(current, 'text', event.target.value);
            }}
          />
        ) : (
          <>
            <p id="exam-answer-help">
              {current <= 14
                ? 'Сохрани готовую работу на компьютере и запиши здесь имя файла. Файл остаётся у тебя; сайт его не загружает и не проверяет.'
                : 'Запиши программу здесь и сохрани её в своей среде программирования. Проверку и запуск выполняй в этой среде.'}
            </p>
            <textarea
              id="exam-answer"
              aria-describedby="exam-answer-help"
              value={answer?.text ?? ''}
              rows={8}
              maxLength={20000}
              spellCheck={false}
              onChange={(event) => {
                session.answer(current, 'text', event.target.value);
              }}
            />
          </>
        )}
        <label htmlFor="exam-reasoning">Черновик решения</label>
        <textarea
          id="exam-reasoning"
          aria-describedby="exam-reasoning-help"
          value={answer?.reasoning ?? ''}
          rows={3}
          maxLength={1500}
          onChange={(event) => {
            session.answer(current, 'reasoning', event.target.value);
          }}
        />
        <p id="exam-reasoning-help">
          До 1500 символов. Сохраняется вместе с ответом; при проверке краткого
          ответа не учитывается.
        </p>
        <div className="task-actions">
          <Button
            variant="secondary"
            disabled={current === 1}
            onClick={() => {
              navigate((current - 1) as TaskNumber);
            }}
          >
            Предыдущее задание
          </Button>
          <Button
            variant="secondary"
            disabled={current === 16}
            onClick={() => {
              navigate((current + 1) as TaskNumber);
            }}
          >
            Следующее задание
          </Button>
        </div>
      </article>
      <ExamDownload draft={draft} />
      <Modal
        open={finishOpen}
        title="Завершить экзамен?"
        onClose={() => {
          setFinishOpen(false);
        }}
        returnFocusRef={finishButton}
      >
        <p>
          {empty.length
            ? `Без записи: №${empty.join(', №')}.`
            : 'Записи есть во всех 16 заданиях.'}
        </p>
        {draft.marked.length > 0 && (
          <p>Отмечены для возврата: №{draft.marked.join(', №')}.</p>
        )}
        <p>
          После завершения изменить ответы в этой попытке нельзя. Файлы работ
          должны быть сохранены на твоём компьютере.
        </p>
        <div className="task-actions">
          <Button
            onClick={() => {
              session.finish();
            }}
          >
            Завершить и открыть разбор
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFinishOpen(false);
            }}
          >
            Продолжить решать
          </Button>
        </div>
      </Modal>
      <Modal
        open={changeOpen}
        title="Сменить работу №13?"
        onClose={() => {
          setChangeOpen(false);
        }}
        returnFocusRef={changeButton}
      >
        <p>
          Откроется{' '}
          {draft.variant13 === 'presentation'
            ? 'документ №13.2'
            : 'презентация №13.1'}
          . Запись, черновик и самооценка прежней работы №13 будут удалены из
          этой попытки. Остальные ответы сохранятся.
        </p>
        <div className="task-actions">
          <Button
            onClick={() => {
              session.choose13(
                draft.variant13 === 'presentation'
                  ? 'document'
                  : 'presentation',
              );
              setChangeOpen(false);
            }}
          >
            Сменить работу
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setChangeOpen(false);
            }}
          >
            Оставить выбранную
          </Button>
        </div>
      </Modal>
    </section>
  );
}
