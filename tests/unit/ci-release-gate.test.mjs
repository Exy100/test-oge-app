import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preparationLessons } from '../../src/lib/lessons/preparation.ts';
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
  expect(jobs.browsers.steps.some((step) => step.run === 'npm run build')).toBe(
    true,
  );
  expect(
    jobs.browsers.steps.some(
      (step) =>
        step.run === 'npx playwright test --shard=${{ matrix.shard }}/2',
    ),
  ).toBe(true);
  expect(
    jobs.browsers.steps.some((step) =>
      step.uses?.startsWith('actions/upload-pages-artifact@'),
    ),
  ).toBe(true);
});

test('Lighthouse shards cover every URL and released lesson exactly once with unchanged budgets', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  expect(workflow.jobs.performance.strategy.matrix.shard).toEqual([1, 2]);
  expect(workflow.jobs.performance.strategy['fail-fast']).toBe(false);
  const step = workflow.jobs.performance.steps.find((step) =>
    step.run?.includes('npm run lh'),
  );
  expect(step.env.OGE_LH_SHARD).toBe('${{ matrix.shard }}');
  const artifact = workflow.jobs.performance.steps.find(
    (step) => step.name === 'Save performance reports',
  );
  expect(artifact.with.name).toBe('lighthouse-reports-${{ matrix.shard }}');
  const full = lighthouseConfig();
  const shards = ['1', '2'].map(lighthouseConfig);
  const urls = shards.flatMap((config) => config.collect.url);
  expect(urls.toSorted()).toEqual(full.collect.url.toSorted());
  expect(new Set(urls).size).toBe(urls.length);
  for (const lesson of preparationLessons)
    expect(urls).toContain('http://127.0.0.1:4323/test-oge-app' + lesson.route);
  for (const config of [full, ...shards]) {
    expect(config.collect.numberOfRuns).toBe(3);
    expect(config.assert).toEqual(full.assert);
    expect(config.assert.assertions['categories:performance']).toEqual([
      'error',
      { minScore: 0.9 },
    ]);
    expect(config.assert.assertions['categories:accessibility']).toEqual([
      'error',
      { minScore: 0.95 },
    ]);
    expect(config.collect.url.length).toBeGreaterThan(0);
  }
});

test('an invalid Lighthouse shard stops instead of silently omitting URLs', () => {
  for (const shard of ['0', '3', 'wrong'])
    expect(() => lighthouseConfig(shard)).toThrow('OGE_LH_SHARD');
});

function lighthouseConfig(shard) {
  const env = { ...process.env };
  delete env.OGE_LH_SHARD;
  if (shard !== undefined) env.OGE_LH_SHARD = shard;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        "process.stdout.write(JSON.stringify(require('./lighthouserc.cjs').ci))",
      ],
      { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] },
    ),
  );
}
