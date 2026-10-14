import { createDataset, type Dataset } from '../datasets';
import type { TaskInstance } from '../types';
import {
  isSearchKind,
  searchDatasetId,
  searchSources,
} from './11/search-files';

export async function createTaskDataset(task: TaskInstance): Promise<Dataset> {
  if (
    !isSearchKind(task.subtype) ||
    task.taskNumber !== 11 ||
    task.generatorId !== `${task.subtype}-v1` ||
    task.datasetId !== searchDatasetId(task.subtype, task.seed)
  )
    throw new Error('Неизвестный файловый набор задания.');
  const { files } = searchSources(task.subtype, task.seed);
  return createDataset(
    task.datasetId,
    task.seed,
    task.generatorId,
    [...files].map(([path, bytes]) => ({
      path,
      format: 'txt',
      bytes,
      license: 'CC0-1.0',
    })),
  );
}
