import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import type { Generator } from '../src/core/types';
import {
  checkGeneratorSeed,
  type GeneratorChecks,
} from '../src/core/generators/quality';

/** One call registers the mandatory 500-seed property and three golden cases. */
export function testGenerator(generator: Generator, checks: GeneratorChecks) {
  describe(generator.id, () => {
    test('500 seeds: determinism, schema, independent oracle, resources and formulas', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
          (seeds) => {
            for (const seed of seeds)
              checkGeneratorSeed(generator, seed, checks);
          },
        ),
        { numRuns: 1, seed: 20261009 },
      );
    }, 30000);
    test.each(['golden-1', 'golden-2', 'golden-3'])('golden %s', (seed) => {
      expect(checkGeneratorSeed(generator, seed, checks)).toMatchSnapshot();
    });
  });
}
