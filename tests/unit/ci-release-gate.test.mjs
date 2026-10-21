import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

test('release requires every quality job and unconditional Lighthouse success', () => {
  const { jobs } = parse(
    readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
  );
  const required = [
    'quality',
    'unit',
    'coverage',
    'files',
    'browsers',
    'performance',
  ];
  expect(jobs.deploy.needs).toEqual(expect.arrayContaining(required));
  for (const id of required)
    expect(jobs[id]['continue-on-error']).not.toBe(true);
  expect(jobs.performance.if).toBeUndefined();
  const budgets = jobs.performance.steps.find((step) =>
    step.run?.includes('npm run lh'),
  );
  expect(budgets).toBeDefined();
  expect(budgets.if).toBeUndefined();
  expect(budgets['continue-on-error']).not.toBe(true);
  expect(jobs.browsers.strategy.matrix.shard).toEqual([1, 2]);
  expect(
    jobs.browsers.steps.some(
      (step) => step.run === 'npm run e2e -- --shard=${{ matrix.shard }}/2',
    ),
  ).toBe(true);
  expect(
    jobs.browsers.steps.some((step) =>
      step.uses?.startsWith('actions/upload-pages-artifact@'),
    ),
  ).toBe(true);
});
