import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

export const runtimeSeeds = [
  '',
  'oge-2027/1',
  'Информатика 🧮',
  'é',
  'e\u0301',
  '\ud800',
  '0',
];
export function rngRuntimeSource(): string {
  return ['../../src/core/rng.ts', './rng-probe.ts']
    .map((file) =>
      stripTypeScriptTypes(
        readFileSync(new URL(file, import.meta.url), 'utf8'),
      ),
    )
    .join('\n');
}
