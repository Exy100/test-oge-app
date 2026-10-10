import { TaskInstanceSchema } from '../schemas';
import type { Generator, TaskInstance } from '../types';

/** Runtime boundary shared by sampling tools and generator tests. */
export function validateGeneratedTask(
  generator: Generator,
  seed: string,
): TaskInstance {
  const task = TaskInstanceSchema.parse(generator.generate(seed));
  if (
    task.generatorId !== generator.id ||
    task.taskNumber !== generator.taskNumber ||
    task.subtype !== generator.subtype ||
    task.seed !== seed
  ) {
    throw new Error('Метаданные задания не совпадают с генератором и seed.');
  }
  const before = JSON.stringify(task);
  if (!generator.verify(task))
    throw new Error('Независимая проверка задания не пройдена.');
  if (before !== JSON.stringify(task))
    throw new Error('verify изменил задание.');
  return task;
}
