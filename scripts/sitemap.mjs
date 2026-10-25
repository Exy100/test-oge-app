import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const xmlText = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** Use the completed build so new static routes cannot be forgotten. */
export async function writeSitemap(directory, origin, base) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const site = new URL(base, origin);
  if (
    site.origin !== origin ||
    !base.startsWith('/') ||
    !base.endsWith('/') ||
    site.search ||
    site.hash
  )
    throw new Error('Проверь адрес и базовый путь sitemap.');
  const files = (await readdir(root, { recursive: true }))
    .filter((file) => file.endsWith('.html'))
    .sort();
  if (!files.length) throw new Error('Нет HTML для sitemap.');
  const urls = [];
  for (const file of files) {
    const html = await readFile(join(root, file), 'utf8');
    const noindex = (html.match(/<meta\b[^>]*>/giu) ?? []).some(
      (meta) =>
        /\bname\s*=\s*["']robots["']/iu.test(meta) &&
        /\bcontent\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/iu.test(meta),
    );
    if (file === '404.html' || noindex) continue;
    const path = file
      .replaceAll('\\', '/')
      .replace(/(?:^|\/)index\.html$/u, '/')
      .replace(/^\//u, '');
    urls.push(new URL(path, site).href);
  }
  if (!urls.length) throw new Error('Нет индексируемых страниц для sitemap.');
  await writeFile(
    join(root, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map((url) => '  <url><loc>' + xmlText(url) + '</loc></url>')
        .join('\n') +
      '\n</urlset>\n',
  );
  return urls.length;
}
