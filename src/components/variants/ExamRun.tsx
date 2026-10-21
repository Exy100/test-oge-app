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
import { isRobotKind } from '../../core/generators/15/fields';
import { isProgramKind } from '../../core/generators/16/problems';
import RobotPractice from '../tasks/RobotPractice';
import PythonPractice from '../tasks/PythonPractice';
import CriteriaLevels from '../tasks/CriteriaLevels';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import ExamFinished, { ExamDownload } from './ExamFinished';
import { buildExamVariant } from '../../core/variants/result-variant';
import ExamTask from './ExamTask';
import VariantFiles from './VariantFiles';
import TrainingTask from './TrainingTask';
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
  const training = draft.mode === 'training';
  const variant = useMemo(
    () =>
      buildExamVariant({
        variantId: draft.variantId,
        seed: draft.seed,
        variant13: draft.variant13,
      }),
    [draft.variantId, draft.seed, draft.variant13],
  );
  const [current, setCurrent] = useState<TaskNumber>(() =>
    training ? (draft.currentTask ?? 1) : (emptyExamNumbers(draft)[0] ?? 1),
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
    const ticker = training ? null : window.setInterval(session.tick, 1000);
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
      if (ticker !== null) clearInterval(ticker);
      clearInterval(saver);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', visible);
      window.removeEventListener('beforeunload', leave);
    };
  }, [session, phase, training]);
  useEffect(() => {
    if (phase !== 'running') releaseLock();
    if (phase === 'finished' && state.attempt) {
      const url = new URL(window.location.href);
      url.searchParams.set(state.attempt.mode, state.attempt.id);
      window.history.replaceState(null, '', url);
    }
  }, [phase, releaseLock, state.attempt]);
  if (phase === 'finished' && state.attempt)
    return (
      <ExamFinished
        verifiedVariant={variant}
        attempt={state.attempt}
        notice={state.notice}
      />
    );
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
  function navigate(number: TaskNumber) {
    session.tick();
    if (training) session.navigateTraining(number);
    setCurrent(number);
    title.current?.focus();
  }
  return (
    <section
      className="exam-run"
      aria-label={training ? 'Прохождение тренировки' : 'Прохождение экзамена'}
    >
      <header className="exam-toolbar">
        {training ? (
          <h2>Тренировка — без таймера</h2>
        ) : (
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
        )}
        <p>
          {16 - empty.length} из 16{' '}
          {training ? 'проверено или разобрано' : 'с записью'} ·{' '}
          {draft.marked.length} отмечено
        </p>
        <Button
          ref={finishButton}
          variant="secondary"
          onClick={() => {
            session.tick();
            setFinishOpen(true);
          }}
        >
          {training ? 'Завершить тренировку' : 'Завершить экзамен'}
        </Button>
      </header>
      {!training && (
        <p className="ui-sr-only" role="status">
          {threshold
            ? `Осталось не больше ${String(threshold)} минут.`
            : 'Экзамен начался. У тебя 150 минут.'}
        </p>
      )}
      <p role="status">
        {state.notice ||
          (browserStore().memoryOnly
            ? 'Ответы хранятся только в памяти этой страницы. Скачай их перед закрытием.'
            : state.dirty
              ? 'Есть изменения. Автосохранение — каждые 10 секунд.'
              : 'Ответы сохранены в этом браузере.')}
      </p>
      <VariantFiles variantId={draft.variantId} seed={draft.seed} />
      <nav
        className="exam-navigation"
        aria-label={training ? 'Задания тренировки' : 'Задания экзамена'}
      >
        {examNumbers.map((number) => (
          <button
            type="button"
            key={number}
            aria-current={current === number ? 'step' : undefined}
            data-filled={!empty.includes(number)}
            aria-label={`Задание №${String(number)}${training ? (empty.includes(number) ? ', ещё не проверено' : ', проверено или разобрано') : empty.includes(number) ? ', нет записи' : ', есть запись'}${draft.marked.includes(number) ? ', отмечено для возврата' : ''}`}
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
        Зелёный фон —{' '}
        {training ? 'задание проверено или разобрано' : 'есть запись'}. ⚑ —
        вернуться к заданию. Для работ №13–14 запись имени файла не заменяет
        сохранение самого файла.
      </p>
      <article
        className={training ? 'exam-task' : 'task-card exam-task'}
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
        {training ? (
          <TrainingTask
            key={task.id}
            task={task}
            draft={draft}
            session={session}
          />
        ) : (
          <>
            <ExamTask key={task.id} task={task} />
            {task.criteria && (
              <section aria-label="Критерии практической работы">
                <p>
                  Максимум — {task.criteria.max} балл(а). Это учебные критерии;
                  на экзамене работу оценивают эксперты.
                </p>
                <CriteriaLevels criteria={task.criteria} />
              </section>
            )}
            {current <= 14 ? (
              <>
                <label htmlFor="exam-answer">
                  {current <= 12 ? 'Твой ответ' : 'Имя файла с твоей работой'}
                </label>
                {current >= 13 && (
                  <p id="exam-answer-help">
                    Сохрани готовую работу на компьютере и запиши здесь имя
                    файла. Файл остаётся у тебя; сайт его не загружает и не
                    проверяет.
                  </p>
                )}
                <input
                  id="exam-answer"
                  type="text"
                  aria-describedby={
                    current >= 13 ? 'exam-answer-help' : undefined
                  }
                  value={answer?.text ?? ''}
                  maxLength={1000}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => {
                    session.answer(current, 'text', event.target.value);
                  }}
                />
              </>
            ) : isRobotKind(task.subtype) ? (
              <RobotPractice
                key={task.id}
                kind={task.subtype}
                seed={task.seed}
                mode="exam"
                value={answer?.text ?? ''}
                onChange={(code) => {
                  session.answer(15, 'text', code);
                }}
              />
            ) : isProgramKind(task.subtype) ? (
              <PythonPractice
                key={task.id}
                kind={task.subtype}
                seed={task.seed}
                mode="exam"
                value={answer?.text ?? ''}
                onChange={(code) => {
                  session.answer(16, 'text', code);
                }}
              />
            ) : null}
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
              До 1500 символов. Сохраняется вместе с ответом; при проверке
              краткого ответа не учитывается.
            </p>
          </>
        )}
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
        title={training ? 'Завершить тренировку?' : 'Завершить экзамен?'}
        onClose={() => {
          setFinishOpen(false);
        }}
        returnFocusRef={finishButton}
      >
        <p>
          {empty.length
            ? `${training ? 'Не проверены или не разобраны' : 'Без записи'}: №${empty.join(', №')}.`
            : training
              ? 'Все 16 номеров проверены или разобраны.'
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
