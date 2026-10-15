import { bankTasks, documentTasks } from '../../src/core/banks';
import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatorsForTask } from '../../src/core/generators';
import { createTaskDataset } from '../../src/core/generators/task-dataset';

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
  ['--task', '16', '--n', '0'],
  ['--task', '1', '--n', '0'],
  ['--task', '17'],
  ['--task', '13', '--n', '13'],
  ['--task', '1', '--task', '1'],
  ['--unknown', '1'],
  ['--task', '1', '--variant', 'document'],
  ['--task', '13', '--variant', 'wrong'],
  ['--task', '1', '--files-dir', 'unused'],
  ['--task', '11', '--files-dir', '  '],
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

test.each([11, 12, 14, 15, 16])(
  'file sample CLI exports №%i datasets linked in Markdown',
  async (taskNumber) => {
    const root = await mkdtemp(join(tmpdir(), 'oge-file-cli-'));
    try {
      const directory = join(root, 'files');
      const output = execFileSync(
        process.execPath,
        [
          'scripts/sample-tasks.mjs',
          '--task',
          String(taskNumber),
          '--n',
          String(generatorsForTask(taskNumber).length),
          '--seed',
          'cli',
          '--files-dir',
          directory,
        ],
        { encoding: 'utf8' },
      );
      const generators = generatorsForTask(taskNumber);
      for (let index = 0; index < generators.length; index++) {
        const expected = await createTaskDataset(
          generators[index].generate(`cli:${index}`),
        );
        const entry = String(index + 1).padStart(2, '0');
        expect(output).toContain(`files/${entry}/dataset.zip`);
        expect(
          Buffer.compare(
            await readFile(join(directory, entry, 'dataset.zip')),
            Buffer.from(expected.archive),
          ),
        ).toBe(0);
        expect(
          JSON.parse(
            await readFile(join(directory, entry, 'manifest.json'), 'utf8'),
          ),
        ).toEqual(expected.manifest);
        for (const [path, bytes] of expected.files) {
          expect(
            Buffer.compare(
              await readFile(join(directory, entry, 'files', path)),
              Buffer.from(bytes),
            ),
          ).toBe(0);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test.each(['presentation', 'document'])(
  'curated %s CLI exports the original dataset and defaults to twelve sets',
  async (variant) => {
    const listing = execFileSync(
      process.execPath,
      ['scripts/sample-tasks.mjs', '--task', '13', '--variant', variant],
      { encoding: 'utf8' },
    );
    expect(listing.match(/^## /gmu)).toHaveLength(12);
    const directory = await mkdtemp(join(tmpdir(), 'oge-presentation-cli-'));
    try {
      const output = execFileSync(
        process.execPath,
        [
          'scripts/sample-tasks.mjs',
          '--task',
          '13',
          '--variant',
          variant,
          '--n',
          '1',
          '--files-dir',
          directory,
        ],
        { encoding: 'utf8' },
      );
      const task = variant === 'document' ? documentTasks[0] : bankTasks[0];
      if (!task) throw new Error('Missing curated task');
      const dataset = await createTaskDataset(task);
      expect(output).toContain(variant === 'document' ? 'D01.odt' : 'P01.odp');
      expect(
        JSON.parse(
          await readFile(join(directory, '01', 'manifest.json'), 'utf8'),
        ),
      ).toEqual(dataset.manifest);
      expect(
        Buffer.compare(
          await readFile(join(directory, '01', 'dataset.zip')),
          Buffer.from(dataset.archive),
        ),
      ).toBe(0);
      for (const [path, bytes] of dataset.files)
        expect(
          Buffer.compare(
            await readFile(join(directory, '01', 'files', path)),
            Buffer.from(bytes),
          ),
        ).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
