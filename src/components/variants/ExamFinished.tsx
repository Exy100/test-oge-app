import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFixedVariant, buildVariant } from '../../core/variants';
import { fixedVariants } from '../../core/variants/catalog';
import { scoreVariant } from '../../core/scoring';
import {
  examClock,
  type ExamAttempt,
  type ExamDraft,
} from '../../core/variants/exam';
import type { TaskInstance } from '../../core/types';
import { sitePath } from '../../lib/site';
import TaskGuidance from '../tasks/TaskGuidance';
import { Button } from '../ui/Button';
import ExamTask from './ExamTask';
import VariantFiles from './VariantFiles';

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
export function buildExamVariant(
  draft: Pick<ExamDraft, 'variantId' | 'variant13' | 'seed'>,
) {
  return fixedVariants.some((row) => row.id === draft.variantId)
    ? buildFixedVariant(draft.variantId, draft.variant13)
    : buildVariant(draft.seed, draft.variant13);
}
function ReviewTask({
  task,
  attempt,
}: {
  task: TaskInstance;
  attempt: ExamAttempt;
}) {
  const [open, setOpen] = useState(false);
  const answer = attempt.answers.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  const assessment = attempt.assessments.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  return (
    <details
      className="variant-task"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <h3>
          Задание №{task.taskNumber}
          {task.variant13 === 'presentation'
            ? '.1'
            : task.variant13 === 'document'
              ? '.2'
              : ''}
        </h3>
      </summary>
      {open && (
        <div className="variant-task-body">
          <ExamTask task={task} finished />
          <h4>Твоя запись</h4>
          <pre className="exam-saved-answer">
            {answer?.text || 'Нет записи'}
          </pre>
          {answer?.reasoning && (
            <>
              <h4>Твой черновик</h4>
              <p>{answer.reasoning}</p>
            </>
          )}
          {attempt.mode === 'training' && task.criteria && (
            <p>
              {assessment
                ? `Сохранённая учебная оценка: ${String(assessment.score)} из ${String(task.criteria.max)}.`
                : answer?.checked
                  ? 'Работа оставлена без оценки.'
                  : 'Работа не оценена.'}
            </p>
          )}
          <TaskGuidance task={task} />
        </div>
      )}
    </details>
  );
}
export default function ExamFinished({
  attempt,
  notice = '',
}: {
  attempt: ExamAttempt;
  notice?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const variant = useMemo(() => buildExamVariant(attempt), [attempt]);
  const result = useMemo(
    () =>
      scoreVariant(variant, {
        answers: variant.tasks
          .filter((task) => task.taskNumber <= 12)
          .map((task) => ({
            taskId: task.id,
            answer:
              attempt.answers.find((row) => row.taskNumber === task.taskNumber)
                ?.text ?? '',
          })),
        practice: [],
      }),
    [variant, attempt],
  );
  return (
    <section className="exam-finished" aria-labelledby="exam-finished-title">
      <h2 ref={heading} id="exam-finished-title" tabIndex={-1}>
        {attempt.mode === 'training'
          ? 'Тренировка завершена'
          : 'Экзамен завершён'}
      </h2>
      <p>
        {attempt.mode === 'exam' && (
          <>Время работы: {examClock(attempt.elapsedMs)}. </>
        )}
        Ответы больше не изменяются.
      </p>
      <p>
        Краткие ответы №1–12: <strong>{result.knownScore} из 12</strong>.
        {attempt.mode === 'training'
          ? `Сохранено самооценок практики: ${String(attempt.assessments.length)} из 4. Это учебные оценки, не вердикт эксперта.`
          : 'Практические работы №13–16 не оценены, поэтому итоговый балл не выставлен.'}
      </p>
      {notice && <p role="alert">{notice}</p>}
      <div className="task-actions">
        <ExamDownload draft={attempt} />
        <a href={sitePath('/variants/')}>Все варианты и история</a>
      </div>
      <VariantFiles variantId={attempt.variantId} seed={attempt.seed} />
      <h3>Ответы и разбор</h3>
      {variant.tasks.map((task) => (
        <ReviewTask key={task.id} task={task} attempt={attempt} />
      ))}
    </section>
  );
}
