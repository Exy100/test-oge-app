import type { DatasetFile, TaskNumber } from '../types';
import {
  isSearchKind,
  searchDatasetId,
  searchSources,
} from './11/search-files';
import {
  formatOf,
  isSelectionKind,
  selectionDatasetId,
  selectionSources,
} from './12/select-files';

export interface TaskSourceFile {
  path: string;
  format: DatasetFile['format'];
  bytes: Uint8Array;
}
export interface TaskSources {
  taskNumber: TaskNumber;
  datasetId: string;
  files: TaskSourceFile[];
}

/** Real file bytes of a dataset subtype; null when the subtype has no files. */
export function taskSources(subtype: string, seed: string): TaskSources | null {
  if (isSearchKind(subtype))
    return {
      taskNumber: 11,
      datasetId: searchDatasetId(subtype, seed),
      files: [...searchSources(subtype, seed).files].map(([path, bytes]) => ({
        path,
        format: 'txt',
        bytes,
      })),
    };
  if (isSelectionKind(subtype))
    return {
      taskNumber: 12,
      datasetId: selectionDatasetId(subtype, seed),
      files: [...selectionSources(subtype, seed).files].map(
        ([path, bytes]) => ({ path, format: formatOf(path), bytes }),
      ),
    };
  return null;
}
