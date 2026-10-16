import type { Generator } from '../types.ts';

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
