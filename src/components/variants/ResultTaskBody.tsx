import type { TaskInstance, Score } from '../../core/types';
import type { ExamAttempt } from '../../core/variants/exam';
import { ScoreSchema } from '../../core/schemas';
import ExamTask from './ExamTask';
import TaskGuidance from '../tasks/TaskGuidance';
import CriteriaLevels from '../tasks/CriteriaLevels';
import { Button } from '../ui/Button';
import AiWorkPanel from '../ai/AiWorkPanel';
import AiPanel from '../ai/AiPanel';
import { aiApiEnabled } from '../../lib/ai/provider';

export interface ResultTaskBodyProps {
  task: TaskInstance;
  attempt: ExamAttempt;
  disabled: boolean;
  onAssess: (
    number: 13 | 14 | 15 | 16,
    score: Score | null,
    source?: 'self' | 'aiAccepted',
  ) => boolean;
}
export default function ResultTaskBody({
  task,
  attempt,
  disabled,
  onAssess,
}: ResultTaskBodyProps) {
  const answer = attempt.answers.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  const assessment = attempt.assessments.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  const number = task.taskNumber;
  return (
    <>
      <ExamTask task={task} finished />
      <h4>Твоя запись</h4>
      <pre className="exam-saved-answer">{answer?.text || 'Нет записи'}</pre>
      {answer?.reasoning && (
        <>
          <h4>Твой черновик</h4>
          <p>{answer.reasoning}</p>
        </>
      )}
      {task.answer.type !== 'artifact' && (
        <p>
          Правильный ответ: <strong>{task.answer.value}</strong>.
        </p>
      )}
      {task.criteria && number >= 13 && (
        <div className="result-assessment">
          <p>
            {assessment
              ? `Сохранённая учебная оценка: ${String(assessment.score)} из ${String(task.criteria.max)}.`
              : answer?.checked
                ? 'Работа оставлена без оценки.'
                : 'Работа не оценена.'}
          </p>
          {assessment && (
            <p>
              Источник:{' '}
              {assessment.source === 'self'
                ? 'твоя самооценка'
                : 'принятое тобой предложение ИИ'}
              .
            </p>
          )}
          <CriteriaLevels
            criteria={task.criteria}
            selection={{
              value: assessment ? ScoreSchema.parse(assessment.score) : null,
              disabled,
              onChange: (score) => {
                onAssess(number as 13 | 14 | 15 | 16, score);
              },
            }}
          />
          <Button
            variant="secondary"
            disabled={disabled || !assessment}
            onClick={() => {
              onAssess(number as 13 | 14 | 15 | 16, null);
            }}
          >
            Снять оценку
          </Button>
        </div>
      )}
      <TaskGuidance task={task} />
      {aiApiEnabled && number <= 12 && answer?.text && (
        <AiPanel
          taskNumber={number}
          request={{
            generatorId: task.generatorId,
            seed: task.seed,
            answer: answer.text,
            reasoning: answer.reasoning,
          }}
        />
      )}
      {aiApiEnabled && task.answer.type === 'artifact' && (
        <AiWorkPanel
          key={task.id}
          task={task}
          savedText={answer?.text ?? ''}
          disabled={disabled}
          onAccept={(score) =>
            onAssess(number as 13 | 14 | 15 | 16, score, 'aiAccepted')
          }
        />
      )}
    </>
  );
}
