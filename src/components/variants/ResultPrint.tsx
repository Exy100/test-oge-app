import type { Variant, TaskInstance } from '../../core/types';
import type { ExamAttempt } from '../../core/variants/exam';
import type { VariantScore } from '../../core/scoring';
import { attemptVariantLabel } from '../../lib/variant-links';
import { renderTaskGuidance } from '../../lib/task-guidance';
import RichTextView from '../RichTextView';
import RichText from '../RichText';
import Figure from '../Figure';
import CriteriaLevels from '../tasks/CriteriaLevels';
import ResultSummary from './ResultSummary';
import ResultPlan from './ResultPlan';

function PrintTask({
  task,
  attempt,
}: {
  task: TaskInstance;
  attempt: ExamAttempt;
}) {
  const answer = attempt.answers.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  const assessment = attempt.assessments.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  return (
    <section className="result-print-task">
      <h3>
        Задание №{task.taskNumber}
        {task.variant13 === 'presentation'
          ? '.1'
          : task.variant13 === 'document'
            ? '.2'
            : ''}
      </h3>
      <RichText source={task.statement} />
      {task.figure && (
        <Figure
          spec={task.figure}
          label={`Схема к заданию №${String(task.taskNumber)}`}
        />
      )}
      <h4>Твоя запись</h4>
      <pre className="exam-saved-answer">{answer?.text || 'Нет записи'}</pre>
      {answer?.reasoning && (
        <>
          <h4>Твой черновик</h4>
          <p>{answer.reasoning}</p>
        </>
      )}
      {task.answer.type !== 'artifact' && (
        <p>Правильный ответ: {task.answer.value}.</p>
      )}
      {task.criteria && (
        <>
          <p>
            {assessment
              ? `Учебная оценка: ${String(assessment.score)} из ${String(task.criteria.max)}. Источник: ${assessment.source === 'self' ? 'самооценка' : 'принятое предложение ИИ'}.`
              : 'Работа не оценена.'}
          </p>
          <CriteriaLevels criteria={task.criteria} />
        </>
      )}
      <h4>Решение</h4>
      {task.solution.map((_, index) => (
        <RichTextView
          key={index}
          html={renderTaskGuidance(task, 'solution', index)}
        />
      ))}
    </section>
  );
}
export default function ResultPrint({
  variant,
  attempt,
  result,
}: {
  variant: Variant;
  attempt: ExamAttempt;
  result: VariantScore;
}) {
  return (
    <div className="result-print">
      <h2>Результат: {attemptVariantLabel(attempt)}</h2>
      <p>
        {attempt.mode === 'exam' ? 'Экзамен' : 'Тренировка'} · завершён{' '}
        {new Date(attempt.finishedAt).toLocaleString('ru-RU')} · работа №
        {attempt.variant13 === 'presentation' ? '13.1' : '13.2'}.
      </p>
      <p>
        Seed: {attempt.seed}. Попытка: {attempt.id}.
      </p>
      <ResultSummary result={result} />
      <ResultPlan result={result} variant13={attempt.variant13} />
      <table className="result-table">
        <caption>Баллы по всем 16 номерам</caption>
        <thead>
          <tr>
            <th scope="col">Номер</th>
            <th scope="col">Баллы</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.taskId}>
              <th scope="row">№{row.taskNumber}</th>
              <td>
                {row.score === null
                  ? 'Не оценено'
                  : `${String(row.score)} из ${String(row.maxScore)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {variant.tasks.map((task) => (
        <PrintTask key={task.id} task={task} attempt={attempt} />
      ))}
    </div>
  );
}
