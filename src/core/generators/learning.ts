/** Historical exercises, retained for lessons and regression checks; excluded from exam selection (ADR-038). */
import {
  fileMaskCount,
  fileSizeTotal,
  fileLargest,
} from './12/select-files.ts';
import type { Generator, TaskNumber } from '../types.ts';
import { textVolume } from './01/text-volume.ts';
import { removedWord } from './01/removed-word.ts';
import { recoding } from './01/recoding.ts';
import { messageCapacity } from './01/message-capacity.ts';
import { fixedCode, prefixCode, separatedCode } from './02/decode.ts';
import { missingCode } from './02/missing-code.ts';
import {
  logicAnd,
  logicNotOr,
  logicDivisibility,
  logicExclusive,
} from './03/logic.ts';
import {
  routeLength,
  shortestRoute,
  routeVia,
  routeWithout,
} from './04/models.ts';

import {
  executorFixed,
  executorShortest,
  executorMissing,
  executorString,
} from './05/executor.ts';
import {
  programAssign,
  programBranch,
  programFor,
  programWhile,
} from './06/programs.ts';

import { urlRoot, urlDirectory, urlSelect, urlMove } from './07/addresses.ts';
import {
  searchUnion,
  searchIntersection,
  searchDifference,
  searchThree,
} from './08/search.ts';

import { pathsAll, pathsVia, pathsWithout, pathsLength } from './09/paths.ts';
import {
  radixToDecimal,
  radixFromDecimal,
  binaryOnes,
  radixCompare,
} from './10/numerals.ts';

import {
  fileQuote,
  fileWordCount,
  filePhraseDocuments,
} from './11/search-files.ts';

import { spreadsheetGenerators } from './14/spreadsheets.ts';
import { createRegistry } from './registry.ts';

export const learningGenerators = createRegistry([
  textVolume,
  removedWord,
  recoding,
  messageCapacity,
  fixedCode,
  prefixCode,
  separatedCode,
  missingCode,
  logicAnd,
  logicNotOr,
  logicDivisibility,
  logicExclusive,
  routeLength,
  shortestRoute,
  routeVia,
  routeWithout,
  executorFixed,
  executorShortest,
  executorMissing,
  executorString,
  programAssign,
  programBranch,
  programFor,
  programWhile,
  urlRoot,
  urlDirectory,
  urlSelect,
  urlMove,
  searchUnion,
  searchIntersection,
  searchDifference,
  searchThree,
  pathsAll,
  pathsVia,
  pathsWithout,
  pathsLength,
  radixToDecimal,
  radixFromDecimal,
  binaryOnes,
  radixCompare,
  fileQuote,
  fileWordCount,
  filePhraseDocuments,
  fileMaskCount,
  fileSizeTotal,
  fileLargest,
  ...spreadsheetGenerators,
]);
export function getLearningGenerator(id: string): Generator {
  const generator = learningGenerators.find((entry) => entry.id === id);
  if (!generator) throw new Error(`Генератор не найден: ${id}.`);
  return generator;
}
export function learningGeneratorsForTask(
  taskNumber: TaskNumber,
): readonly Generator[] {
  return learningGenerators.filter((entry) => entry.taskNumber === taskNumber);
}
