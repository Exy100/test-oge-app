import { useMemo } from 'react';
import type { TaskInstance } from '../../core/types';
import type { ExamDraft, ExamSession } from '../../core/variants/exam';
import { renderRichText } from '../../core/rich-text/render';
import TaskCard from '../tasks/TaskCard';
import { ScoreSchema } from '../../core/schemas/shared';

export default function TrainingTask({
  task,
  draft,
  session,
}: {
  task: TaskInstance;
  draft: ExamDraft;
  session: ExamSession;
}) {
  const statementHtml = useMemo(
    () => renderRichText(task.statement),
    [task.statement],
  );
  const answer = draft.answers.find(
    (row) => row.taskNumber === task.taskNumber,
  );
  const assessment = draft.assessments.find(
    (row) => row.taskNumber === task.taskNumber,
  )?.score;
  return (
    <TaskCard
      task={task}
      statementHtml={statementHtml}
      headingId="exam-task-title"
      work={{
        text: answer?.text ?? '',
        reasoning: answer?.reasoning ?? '',
        checked: answer?.checked ?? false,
        assessment:
          assessment === undefined ? null : ScoreSchema.parse(assessment),
        onChange: (field, value) => {
          session.answer(task.taskNumber, field, value);
        },
        onRetry: () => {
          session.retryTrainingTask(task.taskNumber);
        },
      }}
      onResult={(result) => {
        session.completeTrainingTask(
          task,
          result.kind === 'practice' ? result.score : null,
        );
      }}
    />
  );
}
