import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preparationLessons } from '../../src/lib/lessons/preparation.ts';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import browserConfig from '../../playwright.config';

test('release requires every quality job and unconditional Lighthouse success', () => {
  const { jobs, on: events } = parse(
    readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
  );
  expect(events.push.branches).toContain('main');
  expect(events).toHaveProperty('pull_request');
  expect(events).toHaveProperty('workflow_dispatch');
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
  expect(jobs.browsers.strategy.matrix.shard).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(jobs.browsers['timeout-minutes']).toBe(20);
  expect(jobs.browsers.steps.some((step) => step.run === 'npm run build')).toBe(
    true,
  );
  expect(
    jobs.browsers.steps.some(
      (step) =>
        step.run === 'npx playwright test --shard=${{ matrix.shard }}/10',
    ),
  ).toBe(true);
  expect(
    jobs.browsers.steps.some((step) =>
      step.uses?.startsWith('actions/upload-pages-artifact@'),
    ),
  ).toBe(true);
});

test('the complete suite covers desktop and 360px touch in all three browser engines', () => {
  const projects = browserConfig.projects.filter(
    (project) => project.name !== 'figure-visual',
  );
  expect(projects.map((project) => project.name)).toEqual([
    'chromium',
    'firefox',
    'webkit',
    'mobile',
    'mobile-firefox',
    'mobile-webkit',
  ]);
  expect(
    projects.slice(0, 3).map((project) => project.use.defaultBrowserType),
  ).toEqual(['chromium', 'firefox', 'webkit']);
  for (const project of projects) {
    expect(project.testMatch).toBeUndefined();
    expect(project.testIgnore).toBe('**/figures-visual.spec.ts');
  }
  const mobile = projects.filter((project) =>
    project.name.startsWith('mobile'),
  );
  expect(mobile.map((project) => project.use.defaultBrowserType)).toEqual([
    'chromium',
    'firefox',
    'webkit',
  ]);
  for (const project of mobile) {
    expect(project.use.viewport).toEqual({ width: 360, height: 800 });
    expect(project.use.hasTouch).toBe(true);
  }
  expect(
    mobile.find((project) => project.name === 'mobile-webkit').use.isMobile,
  ).toBe(true);
  expect(
    mobile.find((project) => project.name === 'mobile-firefox').use.isMobile,
  ).toBe(false);
  expect(browserConfig.forbidOnly).toBe(true);
  expect(browserConfig.retries).toBe(0);
});

test('Lighthouse shards cover every URL and released lesson exactly once with unchanged budgets', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  expect(workflow.jobs.performance.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
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
  const shards = ['1', '2', '3', '4'].map(lighthouseConfig);
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
  for (const shard of ['0', '5', 'wrong'])
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

test('office export checks remain required by the file release job', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.scripts['check:office']).toContain('npm run check:office-lessons');
  expect(pkg.scripts['check:office-lessons']).toContain(
    'python3 scripts/check-office-lessons.py',
  );
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  expect(
    workflow.jobs.files.steps.some(
      (step) => step.run === 'npm run check:office',
    ),
  ).toBe(true);
});
