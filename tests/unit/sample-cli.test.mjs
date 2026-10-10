import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('sample CLI writes reproducible Markdown with 50 tasks', () => {
  const args = ['scripts/sample-tasks.mjs', '--task', '1', '--n', '50'];
  const output = execFileSync(process.execPath, args, { encoding: 'utf8' });
  expect(output.startsWith('# Задание №1')).toBe(true);
  expect(output.match(/^## /gmu)).toHaveLength(50);
  expect(execFileSync(process.execPath, args, { encoding: 'utf8' })).toBe(
    output,
  );
});

test.each([
  ['--task', '15', '--n', '50'],
  ['--task', '1', '--n', '0'],
  ['--task', '17'],
  ['--task', '1', '--task', '1'],
  ['--unknown', '1'],
])('sample CLI rejects unsupported arguments %j', (...args) => {
  const result = spawnSync(
    process.execPath,
    ['scripts/sample-tasks.mjs', ...args],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr.trim().length).toBeGreaterThan(0);
});
