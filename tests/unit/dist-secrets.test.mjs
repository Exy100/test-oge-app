import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDistSecrets } from '../../scripts/check-dist-secrets.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'oge-dist-security-'));
  directories.push(path);
  return path;
}

test('scans nested text and binary assets', async () => {
  const root = await fixture();
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<html lang="ru"></html>');
  await writeFile(
    join(root, 'assets/font.woff2'),
    Uint8Array.from([0, 255, 128]),
  );
  expect(await checkDistSecrets(root)).toBe(2);
});

test.each(['provider marker', 'private key'])(
  'rejects %s inside a binary asset without logging its content',
  async (kind) => {
    const root = await fixture();
    const marker =
      kind === 'provider marker'
        ? ['sk', 'or', 'probe'].join('-')
        : ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    await writeFile(
      join(root, 'asset.bin'),
      Buffer.concat([Buffer.from([0, 255]), Buffer.from(marker)]),
    );
    await expect(checkDistSecrets(root)).rejects.toThrow('asset.bin');
    await expect(checkDistSecrets(root)).rejects.not.toThrow(marker);
  },
);

test.each(['.env', '.env.production', '.env-backup', '.ENV.local'])(
  'rejects a published %s even without known secret patterns',
  async (name) => {
    const root = await fixture();
    await writeFile(join(root, name), 'PUBLIC_SETTING=1');
    await expect(checkDistSecrets(root)).rejects.toThrow('Файл окружения');
  },
);

test('rejects symlinks instead of skipping their target', async () => {
  const root = await fixture();
  await writeFile(join(root, 'index.html'), '<html></html>');
  await symlink(join(root, 'index.html'), join(root, 'linked-file'));
  await expect(checkDistSecrets(root)).rejects.toThrow('Символическая ссылка');
});

test('an empty build cannot pass the gate', async () => {
  await expect(checkDistSecrets(await fixture())).rejects.toThrow('пуста');
});
