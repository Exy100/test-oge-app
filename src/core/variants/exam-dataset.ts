import { createDataset } from '../datasets';
import { createTaskDataset } from '../generators/task-dataset';
import type { TaskInstance } from '../types';

/** Exam downloads contain inputs and given layouts, never review packages. */
export async function createExamDataset(task: TaskInstance) {
  if (task.taskNumber < 11 || task.taskNumber > 14)
    throw new TypeError('Для этого номера нет исходного набора экзамена.');
  const full = await createTaskDataset(task);
  const entries = full.manifest.files.filter(
    (file) =>
      task.taskNumber <= 12 ||
      file.path === 'assignment.txt' ||
      file.path.startsWith('source/') ||
      file.path.startsWith('layout/') ||
      (task.taskNumber === 13 && file.path.startsWith('images/')),
  );
  return createDataset(
    `${full.manifest.id}:exam`,
    task.seed,
    `${task.generatorId}:exam`,
    entries.map((file) => {
      const bytes = full.files.get(file.path);
      if (!bytes) throw new Error('Исходный файл отсутствует в наборе.');
      return {
        path: file.path,
        format: file.format,
        license: file.license,
        bytes,
      };
    }),
  );
}
