import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { writeSitemap } from '../../scripts/sitemap.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(files) {
  const directory = await mkdtemp(join(tmpdir(), 'oge-sitemap-'));
  directories.push(directory);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(directory, file, '..'), { recursive: true });
    await writeFile(join(directory, file), content);
  }
  return directory;
}
test('discovers every nested HTML route, respects the repository base and escapes XML', async () => {
  const directory = await fixture({
    'index.html': '<html lang="ru"></html>',
    'materials/i3/logic/index.html': '<html lang="ru"></html>',
    'a&b/index.html': '<html lang="ru"></html>',
    'extra.html': '<html lang="ru"></html>',
    'assets/ignored.js': 'export {};',
    '404.html': '<html lang="ru"></html>',
    'private/index.html': '<meta content="nofollow, noindex" name="robots">',
    'other/index.html': "<META NAME='ROBOTS' CONTENT='NOINDEX'>",
  });
  expect(
    await writeSitemap(directory, 'https://school.example', '/course/'),
  ).toBe(4);
  const source = await readFile(join(directory, 'sitemap.xml'), 'utf8');
  expect(source).toContain('a&amp;b');
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(source);
  expect(parsed.urlset['@_xmlns']).toBe(
    'http://www.sitemaps.org/schemas/sitemap/0.9',
  );
  expect(parsed.urlset.url.map((row) => row.loc).sort()).toEqual([
    'https://school.example/course/',
    'https://school.example/course/a&b/',
    'https://school.example/course/extra.html',
    'https://school.example/course/materials/i3/logic/',
  ]);
});
test('a new built page automatically reaches the next sitemap', async () => {
  const directory = await fixture({ 'index.html': '<html></html>' });
  await writeSitemap(directory, 'https://school.example', '/');
  await mkdir(join(directory, 'new-page'));
  await writeFile(join(directory, 'new-page/index.html'), '<html></html>');
  expect(await writeSitemap(directory, 'https://school.example', '/')).toBe(2);
  expect(await readFile(join(directory, 'sitemap.xml'), 'utf8')).toContain(
    'https://school.example/new-page/',
  );
});
test('empty or completely non-indexable builds fail instead of producing an empty audit', async () => {
  await expect(
    writeSitemap(await fixture({}), 'https://school.example', '/'),
  ).rejects.toThrow('Нет HTML');
  await expect(
    writeSitemap(
      await fixture({ '404.html': '' }),
      'https://school.example',
      '/',
    ),
  ).rejects.toThrow('Нет индексируемых');
});
test('rejects a base that leaves the configured origin', async () => {
  await expect(
    writeSitemap(
      await fixture({ 'index.html': '' }),
      'https://school.example',
      '//other.example/',
    ),
  ).rejects.toThrow('базовый путь');
});
