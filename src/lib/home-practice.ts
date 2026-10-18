import { generatorsForTask } from '../core/generators';
import type { TaskInstance } from '../core/types';
import { defaultStreamFilters } from '../core/stream/filtered';
import { writeStreamQuery } from './stream-url';
import { sitePath } from './site';

export const homeTopics = [
  { id: 'volume', number: 1, title: 'Объём текста', mark: 'Aa' },
  { id: 'logic', number: 3, title: 'Логика', mark: '&' },
  { id: 'binary', number: 10, title: 'Системы счисления', mark: '01' },
] as const;
export type HomeTopic = (typeof homeTopics)[number]['id'];

/** The home page uses the same registered generators and TaskInstance as Stream. */
export function homeTask(topic: HomeTopic, index: number): TaskInstance {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('Номер задания должен быть неотрицательным целым.');
  const metadata = homeTopics.find((item) => item.id === topic);
  const generator = metadata && generatorsForTask(metadata.number)[0];
  if (!generator) throw new Error('Нет генератора выбранной темы.');
  return generator.generate(`home:v1:${topic}:${String(index)}`);
}
export function homeReference(task: TaskInstance) {
  return {
    generatorId: task.generatorId,
    taskNumber: task.taskNumber,
    seed: task.seed,
  };
}
export function homeStreamLink(task: TaskInstance): string {
  return (
    sitePath('/stream/') +
    writeStreamQuery({
      filters: { ...defaultStreamFilters(), numbers: [task.taskNumber] },
      reference: homeReference(task),
    })
  );
}
