import { generators } from '../generators/index.ts';
import {
  bankTasks,
  PRESENTATION_VERSION,
  DOCUMENT_VERSION,
} from '../banks/index.ts';
import type { TaskInstance } from '../types.ts';
import {
  referenceSchema,
  type StreamSource,
  type StreamReference,
} from './schemas.ts';

/** Real generators and curated banks; seed lists are copied for every caller. */
export function streamSources(): StreamSource[] {
  return [
    ...generators.map((generator): StreamSource => {
      const taskNumber = generator.taskNumber;
      if (taskNumber === 13)
        throw new TypeError('Для номера 13 нужен кураторский банк.');
      return { kind: 'generated', generatorId: generator.id, taskNumber };
    }),
    ...(['presentation', 'document'] as const).map(
      (variant13): StreamSource => ({
        kind: 'curated',
        taskNumber: 13,
        variant13,
        generatorId:
          variant13 === 'presentation'
            ? PRESENTATION_VERSION
            : DOCUMENT_VERSION,
        seeds: bankTasks
          .filter((task) => task.variant13 === variant13)
          .map((task) => task.seed),
      }),
    ),
  ];
}
export function resolveStreamTask(input: StreamReference): TaskInstance {
  const reference = referenceSchema.parse(input);
  const generator = generators.find(
    (item) => item.id === reference.generatorId,
  );
  if (generator && generator.taskNumber === reference.taskNumber) {
    const task = generator.generate(reference.seed);
    if (!generator.verify(task))
      throw new Error('Проверка задания потока не пройдена.');
    return task;
  }
  const task = bankTasks.find(
    (item) =>
      item.generatorId === reference.generatorId &&
      item.seed === reference.seed &&
      item.taskNumber === reference.taskNumber,
  );
  if (!task) throw new TypeError('Задание потока не найдено.');
  return structuredClone(task);
}
