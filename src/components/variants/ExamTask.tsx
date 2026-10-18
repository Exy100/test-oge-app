import { memo } from 'react';
import type { TaskInstance } from '../../core/types';
import RichText from '../RichText';
import Figure from '../Figure';
import TaskFiles from '../tasks/TaskFiles';

/** Timer updates must not reformat the condition or replace a download. */
export default memo(function ExamTask({
  task,
  finished = false,
}: {
  task: TaskInstance;
  finished?: boolean;
}) {
  return (
    <>
      <RichText source={task.statement} />
      {task.figure && (
        <Figure
          spec={task.figure}
          label={`Схема к заданию №${String(task.taskNumber)}`}
        />
      )}
      {task.datasetId && (finished || task.taskNumber <= 14) && (
        <TaskFiles task={task} mode={finished ? 'practice' : 'exam'} />
      )}
    </>
  );
});
