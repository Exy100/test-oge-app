import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
} from '../../src/core/variants';
import { createVariantDataset } from '../../src/core/variants/dataset';

test.each(['fixed', 'generated'])(
  'variant CLI exports a reproducible %s document-choice package',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'oge-variant-cli-'));
    try {
      const args = [
        'scripts/sample-variant.mjs',
        ...(mode === 'fixed' ? ['--id', 'V02'] : ['--seed', 'Пример 🧩']),
        '--variant',
        'document',
        '--output-dir',
        root,
      ];
      const output = execFileSync(process.execPath, args, { encoding: 'utf8' });
      const variant =
          mode === 'fixed'
            ? buildFixedVariant('V02', 'document')
            : buildVariant('Пример 🧩', 'document'),
        dataset = await createVariantDataset(variant);
      expect(output.match(/^## Задание №/gmu)).toHaveLength(16);
      expect(output).toContain('13.2 Документ — выбран');
      expect(
        (await readFile(join(root, 'dataset.zip'))).equals(
          Buffer.from(dataset.archive),
        ),
      ).toBe(true);
      expect(
        JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')),
      ).toEqual(dataset.manifest);
      expect(await readFile(join(root, 'variant.md'), 'utf8')).toBe(output);
      expect(execFileSync(process.execPath, args, { encoding: 'utf8' })).toBe(
        output,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);
test('variant CLI --all writes exactly V01–V10 and valid index links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oge-variants-all-'));
  try {
    const directory = join(root, 'files');
    const output = execFileSync(
      process.execPath,
      ['scripts/sample-variant.mjs', '--all', '--output-dir', directory],
      { encoding: 'utf8' },
    );
    for (const item of fixedVariants) {
      expect(output).toContain(`files/${item.id}/dataset.zip`);
      const dataset = await createVariantDataset(buildFixedVariant(item.id));
      expect(
        (await readFile(join(directory, item.id, 'dataset.zip'))).equals(
          Buffer.from(dataset.archive),
        ),
      ).toBe(true);
    }
    expect(output.match(/^-/gmu)).toHaveLength(10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
test.each([
  ['--all'],
  ['--id', 'V11'],
  ['--variant', 'both'],
  ['--id', 'V01', '--seed', 'x'],
  ['--all', '--seed', 'x', '--output-dir', 'unused'],
  ['--output-dir', ' '],
  ['--id'],
  ['--unknown', '1'],
  ['--id', 'V01', '--id', 'V02'],
])('variant CLI rejects unsupported arguments %j', (...args) => {
  const result = spawnSync(
    process.execPath,
    ['scripts/sample-variant.mjs', ...args],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr.trim().length).toBeGreaterThan(0);
});
