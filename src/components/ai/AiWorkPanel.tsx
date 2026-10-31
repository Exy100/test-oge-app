import { useId, useState } from 'react';
import type { Score, TaskInstance } from '../../core/types';
import { gradeWork } from '../../lib/ai/grade-provider';
import type { AiGrade, Part2Request } from '../../lib/ai/assessment-contract';
import { useAiAction } from './useAiAction';
import AiConsent from './AiConsent';
import '../../styles/task-card.css';

export default function AiWorkPanel({
  task,
  savedText,
  disabled,
  onAccept,
}: {
  task: TaskInstance;
  savedText: string;
  disabled: boolean;
  onAccept: (score: Score) => boolean;
}) {
  const id = useId();
  const office = task.taskNumber <= 14;
  const [solution, setSolution] = useState(
    office ? '' : savedText.slice(0, 3000),
  );
  const [criteriaAnswers, setCriteria] = useState<Record<string, string>>({});
  const request = {
    generatorId: task.generatorId,
    seed: task.seed,
    solution,
    criteriaAnswers,
  };
  return (
    <section className="ai-panel task-card" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>
        {office
          ? 'Помощь ИИ по критериям'
          : 'Предварительный разбор работы с ИИ'}
      </h4>
      <p>
        {office
          ? 'Файл не отправляется и не оценивается. Опиши выполненные действия и вопросы по критериям. Самооценку выбери самостоятельно.'
          : 'Выбери текст кода или алгоритма, который хочешь отправить. Разбор предварительный; балл изменится только после твоего принятия.'}
      </p>
      {!office && savedText.length > 3000 && (
        <p>
          В сохранённой работе больше 3000 символов. Здесь показан первый
          фрагмент: перед отправкой выбери нужный код. Исходная работа сохранена
          полностью.
        </p>
      )}
      <label htmlFor={`${id}-solution`}>
        {office ? 'Описание работы для ИИ' : 'Код или алгоритм для ИИ'}
      </label>
      <textarea
        id={`${id}-solution`}
        rows={6}
        maxLength={3000}
        value={solution}
        disabled={disabled}
        onChange={(event) => setSolution(event.target.value)}
      />
      <p>До 3000 символов. Не добавляй личные данные.</p>
      {task.criteria?.levels.map((level) => (
        <div key={level.score}>
          <label htmlFor={`${id}-criterion-${String(level.score)}`}>
            Что выполнено для уровня {level.score}: {level.description}
          </label>
          <textarea
            id={`${id}-criterion-${String(level.score)}`}
            rows={2}
            maxLength={1500}
            disabled={disabled}
            value={criteriaAnswers[String(level.score)] ?? ''}
            onChange={(event) =>
              setCriteria((previous) => ({
                ...previous,
                [String(level.score)]: event.target.value,
              }))
            }
          />
        </div>
      ))}
      <WorkAction
        key={JSON.stringify(request)}
        request={request}
        number={task.taskNumber}
        disabled={
          disabled ||
          (!solution.trim() &&
            !Object.values(criteriaAnswers).some((value) => value.trim()))
        }
        onAccept={onAccept}
      />
    </section>
  );
}
function WorkAction({
  request,
  number,
  disabled,
  onAccept,
}: {
  request: Part2Request;
  number: number;
  disabled: boolean;
  onAccept: (score: Score) => boolean;
}) {
  const action = useAiAction<AiGrade>('part2-grade');
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const grade = dismissed ? null : action.value;
  return (
    <>
      <div className="task-actions">
        <button
          ref={action.button}
          type="button"
          disabled={disabled || action.busy}
          onClick={() => {
            setDismissed(false);
            setAccepted(false);
            void action.start((signal) => gradeWork(request, number, signal));
          }}
        >
          {action.status === 'error'
            ? 'Повторить разбор работы'
            : 'Разобрать работу с ИИ'}
        </button>
        {action.busy && (
          <button type="button" onClick={action.stop}>
            Остановить разбор работы
          </button>
        )}
      </div>
      <p role="status">
        {action.busy
          ? 'Получаем разбор работы…'
          : action.status === 'stopped'
            ? 'Разбор остановлен.'
            : accepted
              ? 'Предложение ИИ принято.'
              : dismissed
                ? 'Предложение отклонено. Оценка сохранена без изменений.'
                : action.status === 'done'
                  ? 'Разбор работы готов.'
                  : ''}
      </p>
      {action.error && <p role="alert">{action.error}</p>}
      {grade && (
        <div
          ref={action.output}
          tabIndex={-1}
          role="region"
          aria-label="Предварительный разбор работы"
        >
          <p>
            {grade.kind === 'criteria-help'
              ? 'Помощь по критериям. Файл не получен, оценка не выставлена.'
              : `Предварительное предложение: ${String(grade.score)} из 2.`}
          </p>
          <p>{grade.reason}</p>
          <ul>
            {grade.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
          <p>{grade.advice}</p>
          <p>ИИ может ошибаться. Сверяйся с эталонным решением</p>
          <div className="task-actions">
            {grade.kind === 'preliminary' && grade.score !== null && (
              <button
                type="button"
                disabled={disabled || accepted}
                onClick={() => {
                  if (grade.score !== null && onAccept(grade.score))
                    setAccepted(true);
                }}
              >
                Принять предварительный балл
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                action.button.current?.focus();
              }}
            >
              Отклонить предложение
            </button>
          </div>
        </div>
      )}
      <AiConsent
        open={action.status === 'consent'}
        button={action.button}
        close={action.close}
        confirm={action.confirm}
      >
        <p>
          Задание №{number}. Будут переданы условие и критерии с сервера, а
          также только этот текст и ответы по критериям:
        </p>
        <pre>
          {JSON.stringify(
            {
              solution: request.solution,
              criteriaAnswers: request.criteriaAnswers,
            },
            null,
            2,
          )}
        </pre>
      </AiConsent>
    </>
  );
}
