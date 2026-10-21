import { useEffect, useId, useRef, useState } from 'react';
import { checkTaskAnswer, type AnswerCheck } from '../../core/checker';
import type { TaskInstance, Score } from '../../core/types';
import type { StreamOutcome } from '../../core/stream';
import { isRobotKind } from '../../core/generators/15/fields';
import { isProgramKind } from '../../core/generators/16/problems';
import RichTextView from '../RichTextView';
import Figure from '../Figure';
import TaskFiles from './TaskFiles';
import RobotPractice from './RobotPractice';
import PythonPractice from './PythonPractice';
import TaskGuidance from './TaskGuidance';
import CriteriaLevels from './CriteriaLevels';
import '../../styles/task-card.css';

export interface TaskCardProps {
  task: TaskInstance;
  statementHtml: string;
  onResult: (result: StreamOutcome) => void;
}
/** A new task/attempt gets its own keyed state, including editors and downloads. */
export default function TaskCard(props: TaskCardProps) {
  return (
    <TaskCardBody
      key={JSON.stringify([props.task.generatorId, props.task.seed])}
      {...props}
    />
  );
}
function TaskCardBody({ task, onResult, statementHtml }: TaskCardProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const [raw, setRaw] = useState('');
  const [check, setCheck] = useState<AnswerCheck | null>(null);
  const [assessment, setAssessment] = useState<Score | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (accepted) feedback.current?.focus();
  }, [accepted]);
  const short = task.answer.type !== 'artifact';
  const format =
    task.answer.type === 'integer'
      ? 'Целое число, без единиц измерения.'
      : task.answer.type === 'word'
        ? `Слово или текст по условию. ${task.answer.caseSensitive ? 'Регистр важен.' : 'Регистр не важен.'}`
        : task.answer.type === 'sequence'
          ? `Последовательность: ${{ digits: 'цифры', latin: 'латинские буквы', cyrillic: 'русские буквы' }[task.answer.alphabet]}, без разделителей. ${task.answer.caseSensitive ? 'Регистр важен.' : 'Регистр не важен.'}`
          : '';
  function accept(result: StreamOutcome) {
    if (submitted.current) return;
    submitted.current = true;
    setAccepted(true);
    onResult(result);
  }
  return (
    <article className="task-card" aria-labelledby={`${id}-title`}>
      <header>
        <p className="eyebrow">
          Часть {task.examPart} · Сложность {task.difficulty} из 3
        </p>
        <h2 id={`${id}-title`}>
          Задание №{task.taskNumber}
          {task.variant13
            ? task.variant13 === 'presentation'
              ? '.1 — презентация'
              : '.2 — документ'
            : ''}
        </h2>
      </header>
      <RichTextView html={statementHtml} />
      {task.figure && <Figure spec={task.figure} label="Схема задания" />}
      {task.datasetId && <TaskFiles task={task} />}
      {short ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (submitted.current) return;
            const result = checkTaskAnswer(task, raw);
            setCheck(result);
            if (result.verdict === 'format_error') input.current?.focus();
            else
              accept({
                kind: 'automatic',
                correct: result.verdict === 'correct',
              });
          }}
        >
          <label htmlFor={`${id}-answer`}>Твой ответ</label>
          <p id={`${id}-format`}>{format}</p>
          <input
            id={`${id}-answer`}
            ref={input}
            type="text"
            value={raw}
            readOnly={accepted}
            maxLength={1000}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={check?.verdict === 'format_error'}
            aria-describedby={`${id}-format ${id}-feedback`}
            onChange={(event) => {
              setRaw(event.target.value);
              setCheck(null);
            }}
          />
          <button type="submit" disabled={accepted}>
            Проверить ответ
          </button>
          <div
            ref={feedback}
            tabIndex={-1}
            id={`${id}-feedback`}
            role="status"
            className="task-feedback"
            data-verdict={check?.verdict}
          >
            {check?.verdict === 'format_error'
              ? `${check.message} Попытка не засчитана — исправь формат.`
              : check?.verdict === 'correct'
                ? 'Верно! Ответ засчитан.'
                : check?.verdict === 'incorrect'
                  ? 'Пока неверно. Ответ засчитан; к этому заданию можно вернуться для повторения.'
                  : ''}
            {check &&
              check.verdict !== 'format_error' &&
              check.notices.map((notice) => (
                <p key={notice.code}>{notice.message}</p>
              ))}
            {check?.verdict === 'incorrect' && check.explanation && (
              <p className="task-mistake">{check.explanation}</p>
            )}
          </div>
        </form>
      ) : (
        <>
          {isRobotKind(task.subtype) && (
            <RobotPractice kind={task.subtype} seed={task.seed} />
          )}
          {isProgramKind(task.subtype) && (
            <PythonPractice kind={task.subtype} seed={task.seed} />
          )}
          {task.criteria && (
            <section aria-label="Самооценка по критериям">
              <h3>Оцени свою работу</h3>
              <p>
                Это твоя самооценка по учебным критериям, максимум{' '}
                {task.criteria.max}. На экзамене работу оценивают эксперты.
                Эталонные файлы и инструкции для сравнения находятся в ZIP.
              </p>
              <CriteriaLevels
                criteria={task.criteria}
                selection={{
                  value: assessment,
                  onChange: setAssessment,
                  disabled: accepted,
                }}
              />
              <div className="task-actions">
                <button
                  type="button"
                  disabled={accepted || assessment === null}
                  onClick={() => {
                    if (assessment !== null)
                      accept({
                        kind: 'practice',
                        source: 'self',
                        score: assessment,
                      });
                  }}
                >
                  Сохранить самооценку
                </button>
                <button
                  type="button"
                  disabled={accepted}
                  onClick={() => {
                    setAssessment(null);
                    accept({ kind: 'practice', score: null });
                  }}
                >
                  Оставить без оценки
                </button>
              </div>
              <div
                ref={feedback}
                tabIndex={-1}
                role="status"
                aria-label="Результат самооценки"
              >
                {accepted
                  ? assessment !== null
                    ? `Самооценка сохранена: ${String(assessment)} из ${String(task.criteria.max)}.`
                    : 'Работа оставлена без оценки. Точность не изменена.'
                  : ''}
              </div>
            </section>
          )}
        </>
      )}
      <label htmlFor={`${id}-notes`}>Как я решал</label>
      <textarea
        id={`${id}-notes`}
        value={notes}
        maxLength={1500}
        rows={3}
        onChange={(event) => {
          setNotes(event.target.value);
        }}
        aria-describedby={`${id}-notes-help`}
      />
      <p id={`${id}-notes-help`}>
        До 1500 символов. Черновик доступен до смены задания или перезагрузки.
      </p>
      <TaskGuidance task={task} />
    </article>
  );
}
