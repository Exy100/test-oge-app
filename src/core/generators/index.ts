import { robotGenerators } from './15/robots.ts';
import { examPythonGenerators } from './16/programs.ts';
import { spreadsheetGenerators } from './14/exam-spreadsheets.ts';
import { confirmedShortGenerators } from './exam/short-generators.ts';
import { confirmedFileGenerators } from './exam/file-generators.ts';
import { createRegistry } from './registry.ts';
import type { Generator, TaskNumber } from '../types.ts';

export { createRegistry } from './registry.ts';

/** №1–12 contain only sourced exam formats; later numbers retain their current owner tasks. */
export const generators = createRegistry(
  [
    ...confirmedShortGenerators,
    ...confirmedFileGenerators,
    ...spreadsheetGenerators,
    ...robotGenerators,
    ...examPythonGenerators,
  ].sort((a, b) => a.taskNumber - b.taskNumber),
);
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
