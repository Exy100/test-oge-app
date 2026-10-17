import { BaseSequencer, type TestSpecification } from 'vitest/node';

/** Start the three largest file campaigns together, including newly added suites
 * whose timings are absent from Vitest's cache. Every specification is retained. */
export default class OfficeSequencer extends BaseSequencer {
  override async sort(
    files: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const campaigns = [
      '/src/core/generators/14/exam-spreadsheets.test.ts',
      '/tests/unit/exam-file-generators.test.ts',
      '/src/core/generators/spreadsheets.test.ts',
    ];
    const rank = (path: string): number => {
      const index = campaigns.findIndex((suffix) => path.endsWith(suffix));
      return index < 0 ? campaigns.length : index;
    };
    return sorted.sort((a, b) => rank(a.moduleId) - rank(b.moduleId));
  }
}
