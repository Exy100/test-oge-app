import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeSecurityHeaders } from '../../scripts/security-headers.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(policy) {
  const directory = await mkdtemp(join(tmpdir(), 'oge-csp-'));
  directories.push(directory);
  await writeFile(
    join(directory, '_headers'),
    await readFile(new URL('../../public/_headers', import.meta.url)),
  );
  await writeFile(
    join(directory, 'index.html'),
    `<html><head><meta charset="UTF-8"><script src="/theme.js"></script><meta http-equiv="content-security-policy" content="${policy}"></head></html>`,
  );
  return directory;
}
test('hashes from every page reach headers, CSP precedes scripts', async () => {
  const hash = createHash('sha256').update('trusted content').digest('base64');
  const directory = await fixture(
    `script-src 'self' 'sha256-${hash}'; style-src 'self'`,
  );
  await mkdir(join(directory, 'about'));
  const other = createHash('sha256').update('another page').digest('base64');
  await writeFile(
    join(directory, 'about/index.html'),
    `<head><meta charset="UTF-8"><meta http-equiv="content-security-policy" content="script-src 'self'; style-src 'self' 'sha256-${other}'"></head>`,
  );
  await writeSecurityHeaders(directory);
  const headers = await readFile(join(directory, '_headers'), 'utf8');
  expect(headers).toContain(`'sha256-${hash}'`);
  expect(headers).toContain(`'sha256-${other}'`);
  expect(headers).toContain("frame-ancestors 'none'");
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  expect(html.indexOf('content-security-policy')).toBeLessThan(
    html.indexOf('<script'),
  );
});
test.each([
  "script-src 'unsafe-inline'; style-src 'self'",
  "script-src https://example.com; style-src 'self'",
  "script-src 'self'",
])('rejects unsafe or incomplete policy: %s', async (policy) => {
  await expect(writeSecurityHeaders(await fixture(policy))).rejects.toThrow();
});
test('a page without CSP fails the build', async () => {
  const directory = await fixture("script-src 'self'; style-src 'self'");
  await writeFile(
    join(directory, 'missing.html'),
    '<html><head></head></html>',
  );
  await expect(writeSecurityHeaders(directory)).rejects.toThrow('CSP');
});
