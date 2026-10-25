import { readFileSync, readdirSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { SITE_BASE, SITE_ORIGIN } from '../../src/lib/site';

const schema = z.object({
  urlset: z.object({
    '@_xmlns': z.literal('http://www.sitemaps.org/schemas/sitemap/0.9'),
    url: z.array(z.object({ loc: z.url() })).nonempty(),
  }),
});
export function sitemapUrls(source: string): string[] {
  const data: unknown = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === 'url',
  }).parse(source);
  return schema.parse(data).urlset.url.map((row) => row.loc);
}

export const sitemapSource = readFileSync(
  new URL('../../dist/sitemap.xml', import.meta.url),
  'utf8',
);
export const locations = sitemapUrls(sitemapSource);
export const builtPages = readdirSync(new URL('../../dist/', import.meta.url), {
  recursive: true,
})
  .filter(
    (path): path is string =>
      typeof path === 'string' && path.endsWith('.html'),
  )
  .map((file) => ({
    file,
    path:
      file === 'index.html'
        ? ''
        : file.endsWith('/index.html')
          ? file.slice(0, -10)
          : file,
  }));
for (const loc of locations) {
  const url = new URL(loc);
  if (
    url.origin !== SITE_ORIGIN ||
    !url.pathname.startsWith(SITE_BASE) ||
    url.search ||
    url.hash
  )
    throw new Error('Sitemap выходит за пределы опубликованного сайта: ' + loc);
}
export const auditPages = [
  ...new Set([
    ...locations.map((loc) => new URL(loc).pathname.slice(SITE_BASE.length)),
    ...builtPages.map((row) => row.path),
  ]),
]
  .sort()
  .map((path) => ({
    path,
    requestPath: path === '404.html' ? 'missing-a11y-page/' : path || './',
    status: path === '404.html' ? 404 : 200,
    inSitemap: locations.includes(SITE_ORIGIN + SITE_BASE + path),
  }));
