import {
  isSelectionKind,
  selectionDatasetId,
  selectionSources,
} from './12/select-files';
import { createDataset, type Dataset } from '../datasets';
import type { TaskInstance } from '../types';
import {
  isSearchKind,
  searchDatasetId,
  searchSources,
} from './11/search-files';

export async function createTaskDataset(task: TaskInstance): Promise<Dataset> {
  if (task.taskNumber === 16) {
    const { createPythonDataset } = await import('./16/dataset');
    return createPythonDataset(task);
  }
  if (task.taskNumber === 15) {
    const { createRobotDataset } = await import('./15/dataset');
    return createRobotDataset(task);
  }
  if (task.taskNumber === 14) {
    const { createSpreadsheetDataset } = await import('./14/dataset');
    return createSpreadsheetDataset(task);
  }
  if (task.taskNumber === 13 && task.variant13 === 'document') {
    const { createDocumentDataset } = await import('../banks/document-dataset');
    return createDocumentDataset(task);
  }
  if (task.taskNumber === 13 && task.variant13 === 'presentation') {
    const { createPresentationDataset } =
      await import('../banks/presentation-dataset');
    return createPresentationDataset(task);
  }
  let files: Map<string, Uint8Array>;
  if (task.generatorId !== `${task.subtype}-v1`)
    throw new Error('Неизвестный файловый набор задания.');
  if (
    isSearchKind(task.subtype) &&
    task.taskNumber === 11 &&
    task.datasetId === searchDatasetId(task.subtype, task.seed)
  ) {
    files = searchSources(task.subtype, task.seed).files;
  } else if (
    isSelectionKind(task.subtype) &&
    task.taskNumber === 12 &&
    task.datasetId === selectionDatasetId(task.subtype, task.seed)
  ) {
    files = selectionSources(task.subtype, task.seed).files;
  } else throw new Error('Неизвестный файловый набор задания.');
  return createDataset(
    task.datasetId,
    task.seed,
    task.generatorId,
    [...files].map(([path, bytes]) => ({
      path,
      format: path.endsWith('.csv') ? 'csv' : 'txt',
      bytes,
      license: 'CC0-1.0',
    })),
  );
}
