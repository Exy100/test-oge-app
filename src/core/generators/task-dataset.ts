import { createDataset, type Dataset } from '../datasets';
import type { TaskInstance } from '../types';
import { taskSources } from './dataset-sources';

export async function createTaskDataset(task: TaskInstance): Promise<Dataset> {
  const sources = taskSources(task.subtype, task.seed);
  if (
    !sources ||
    task.taskNumber !== sources.taskNumber ||
    task.generatorId !== `${task.subtype}-v1` ||
    task.datasetId !== sources.datasetId
  )
    throw new Error('Неизвестный файловый набор задания.');
  return createDataset(
    sources.datasetId,
    task.seed,
    task.generatorId,
    sources.files.map((file) => ({ ...file, license: 'CC0-1.0' })),
  );
}
