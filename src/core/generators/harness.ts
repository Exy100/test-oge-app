import { TaskInstanceSchema } from '../schemas';
import type { Generator, TaskInstance } from '../types';

/** Schema boundary for the generator harness; the full property suite is T2.9. */
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
  if (!generator.verify(task))
    throw new Error('Независимая проверка задания не пройдена.');
  return task;
}
