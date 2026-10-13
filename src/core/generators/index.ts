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

export function createRegistry(
  entries: readonly Generator[],
): readonly Generator[] {
  const ids = new Set<string>();
  const subtypes = new Set<string>();
  for (const entry of entries) {
    const key = `${String(entry.taskNumber)}:${entry.subtype}`;
    if (
      !entry.id.trim() ||
      !entry.title.trim() ||
      !entry.subtype.trim() ||
      !Number.isInteger(entry.taskNumber) ||
      entry.taskNumber < 1 ||
      entry.taskNumber > 16 ||
      ids.has(entry.id) ||
      subtypes.has(key)
    ) {
      throw new Error(`Некорректный или повторный генератор: ${entry.id}.`);
    }
    ids.add(entry.id);
    subtypes.add(key);
  }
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export const generators = createRegistry([
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
]);
export function getGenerator(id: string): Generator {
  const generator = generators.find((entry) => entry.id === id);
  if (!generator) throw new Error(`Генератор не найден: ${id}.`);
  return generator;
}
export function generatorsForTask(
  taskNumber: TaskNumber,
): readonly Generator[] {
  return generators.filter((entry) => entry.taskNumber === taskNumber);
}
