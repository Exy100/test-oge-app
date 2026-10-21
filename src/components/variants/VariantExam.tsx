import { useCallback, useEffect, useRef, useState } from 'react';
import { browserStore } from '../../core/storage/browser';
import {
  createExamDraft,
  ExamSession,
  type ExamDraft,
} from '../../core/variants/exam';
import {
  attemptVariantHref,
  attemptVariantLabel,
} from '../../lib/variant-links';
import { useStoredAreas } from '../useStoredAreas';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import VariantFiles from './VariantFiles';
import resultUrl from './ExamFinished.tsx?module-url';
import { importFreshModule } from '../../lib/fresh-module';
import '../../styles/result.css';

export interface ExamIdentity {
  variantId: string;
  seed: string;
}
type RunView = (typeof import('./ExamRun'))['default'];
type ReviewView = (typeof import('./ExamFinished'))['default'];
export default function VariantExam({
  variantId,
  seed,
  onClose,
  mode = 'exam',
}: ExamIdentity & { onClose: () => void; mode?: ExamDraft['mode'] }) {
  const training = mode === 'training';
  const areas = useStoredAreas();
  const [choice, setChoice] = useState<ExamDraft['variant13'] | null>(null);
  const [session, setSession] = useState<{
    controller: ExamSession;
    View: RunView;
  } | null>(null);
  const [Review, setReview] = useState<ReviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replace, setReplace] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const release = useRef<(() => void) | null>(null);
  const releaseLock = useCallback(() => {
    release.current?.();
    release.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => {
      alive.current = false;
      releaseLock();
    };
  }, [releaseLock]);
  const draft = areas.variantDraft.current;
  const same =
    draft?.variantId === variantId &&
    draft.seed === seed &&
    draft.mode === mode;
  const query =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get(mode);
  const finished = areas.variantAttempts.entries.find(
    (row) =>
      row.id === query &&
      row.variantId === variantId &&
      row.seed === seed &&
      row.mode === mode,
  );
  const hasFinished = Boolean(finished);
  useEffect(() => {
    if (!hasFinished || Review) return;
    let current = true;
    void importFreshModule<typeof import('./ExamFinished')>(resultUrl)
      .then((module) => {
        if (current) setReview(() => module.default);
      })
      .catch(() => {
        if (current)
          setError(
            'Не удалось открыть разбор. Обнови страницу: сохранённые ответы останутся в истории.',
          );
      });
    return () => {
      current = false;
    };
  }, [hasFinished, Review]);
  function launch(resume: boolean) {
    if (pending.current || (!resume && !choice)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const expected = JSON.stringify(draft);
    const activate = (View: RunView) => {
      if (!alive.current) return;
      const store = browserStore();
      store.refresh();
      if (JSON.stringify(store.read('variantDraft').current) !== expected)
        throw new Error(
          'Сохранённая работа изменилась. Проверь её перед запуском.',
        );
      let current = draft;
      if (!resume && choice) {
        current = createExamDraft(
          { id: crypto.randomUUID(), variantId, seed, variant13: choice },
          Date.now(),
          mode,
        );
        store.write('variantDraft', { version: 1, current });
      }
      if (!current || current.mode !== mode)
        throw new Error('Не удалось восстановить работу.');
      const controller = new ExamSession(store, current);
      controller.tick();
      setSession({ controller, View });
      setReplace(false);
      setBusy(false);
      pending.current = false;
    };
    const fail = (cause: unknown) => {
      releaseLock();
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        setReplace(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось открыть работу. Повтори попытку.',
        );
      }
    };
    void import('./ExamRun')
      .catch(() => {
        throw new Error(
          training
            ? 'Не удалось загрузить задания. Обнови страницу и попробуй начать или продолжить тренировку ещё раз.'
            : 'Не удалось загрузить задания. Обнови страницу и попробуй начать или продолжить экзамен ещё раз.',
        );
      })
      .then(({ default: View }) => {
        if (!alive.current) return;
        const locks = Reflect.get(navigator, 'locks') as
          LockManager | undefined;
        if (!locks) {
          activate(View);
          return;
        }
        return locks.request(
          'oge:informatics:variantDraft',
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error(
                training
                  ? 'Вариант уже открыт в другой вкладке. Закрой её и продолжи тренировку здесь.'
                  : 'Экзамен уже открыт в другой вкладке. Закрой её и нажми «Продолжить экзамен» здесь.',
              );
            if (!alive.current) return;
            await new Promise<void>((resolve, reject) => {
              release.current = resolve;
              try {
                activate(View);
              } catch (cause) {
                resolve();
                reject(
                  cause instanceof Error
                    ? cause
                    : new Error('Не удалось открыть работу.'),
                );
              }
            });
          },
        );
      })
      .catch(fail);
  }
  if (session)
    return (
      <session.View session={session.controller} releaseLock={releaseLock} />
    );
  if (finished)
    return Review ? (
      <Review attempt={finished} />
    ) : (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Открываем сохранённые ответы и разбор…'}
      </p>
    );
  return (
    <section className="exam-setup" aria-labelledby="exam-setup-title">
      <h2 id="exam-setup-title" ref={heading} tabIndex={-1}>
        {training ? 'Тренировка — без таймера' : 'Экзамен — 150 минут'}
      </h2>
      <ul>
        {training ? (
          <>
            <li>Решай в своём темпе: ограничения в 150 минут нет.</li>
            <li>
              Проверяй каждый ответ сразу. Подсказки и решения доступны в
              задании.
            </li>
            <li>
              Для №13–16 сохраняй самооценку по учебным критериям или оставляй
              работу без оценки.
            </li>
          </>
        ) : (
          <>
            <li>Таймер начнётся по кнопке «Начать экзамен».</li>
            <li>
              Он продолжает идти после закрытия страницы или выключения
              компьютера.
            </li>
            <li>Проверка, подсказки и разбор откроются после завершения.</li>
          </>
        )}
        <li>Ответы сохраняются каждые 10 секунд и при уходе со страницы.</li>
        <li>
          №13–14 выполняй в офисном редакторе. Для №15 есть поле и запуск
          Робота, для №16 — редактор Python и инструкция запуска на компьютере.
        </li>
        <li>Файлы работ сохраняй на своём компьютере.</li>
      </ul>
      {draft && (
        <div className="exam-notice">
          <h3>Есть незавершённая работа</h3>
          <p>
            {attemptVariantLabel(draft)} · начата{' '}
            {new Date(draft.startedAt).toLocaleString('ru-RU')}.
          </p>
          {same ? (
            <Button
              disabled={busy}
              onClick={() => {
                launch(true);
              }}
            >
              {training ? 'Продолжить тренировку' : 'Продолжить экзамен'}
            </Button>
          ) : (
            (() => {
              const href = attemptVariantHref(draft);
              return href ? (
                <a
                  href={`${href}${href.includes('?') ? '&' : '?'}${draft.mode}=1`}
                >
                  Вернуться к незавершённому варианту
                </a>
              ) : (
                <p>
                  Эта работа не воспроизводится из текущего каталога. Её ответы
                  доступны в экспорте настроек.
                </p>
              );
            })()
          )}
        </div>
      )}
      <VariantFiles variantId={variantId} seed={seed} />
      <fieldset className="exam-choice" disabled={busy}>
        <legend>Какую работу №13 будешь выполнять?</legend>
        <label>
          <input
            type="radio"
            name="exam-choice"
            checked={choice === 'presentation'}
            onChange={() => {
              setChoice('presentation');
            }}
          />
          13.1 — Презентация
        </label>
        <label>
          <input
            type="radio"
            name="exam-choice"
            checked={choice === 'document'}
            onChange={() => {
              setChoice('document');
            }}
          />
          13.2 — Документ
        </label>
      </fieldset>
      <div className="task-actions">
        <Button
          disabled={!choice || busy}
          loading={busy}
          onClick={() => {
            if (draft) setReplace(true);
            else launch(false);
          }}
        >
          {training
            ? draft
              ? 'Начать новую тренировку'
              : 'Начать тренировку'
            : draft
              ? 'Начать новый экзамен'
              : 'Начать экзамен'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Вернуться к условиям
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <Modal
        open={replace}
        title="Заменить незавершённую работу?"
        onClose={() => {
          setReplace(false);
        }}
      >
        <p>
          Её ответы и отметки будут удалены из текущего экзамена. Чтобы
          сохранить их, сначала экспортируй данные в настройках.
        </p>
        <div className="task-actions">
          <Button
            onClick={() => {
              launch(false);
            }}
            disabled={busy}
          >
            Заменить и начать
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setReplace(false);
            }}
          >
            Оставить работу
          </Button>
        </div>
      </Modal>
    </section>
  );
}
