export const SITE_ORIGIN = 'https://exy100.github.io';
export const SITE_BASE = '/test-oge-app/';

/** Convert an application route to its GitHub Pages path. */
export function sitePath(route: string): string {
  if (!route.startsWith('/') || route.startsWith('//')) {
    throw new TypeError('Ожидается внутренний путь, начинающийся с /.');
  }
  const url = new URL(`${SITE_BASE}${route.slice(1)}`, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN || !url.pathname.startsWith(SITE_BASE)) {
    throw new TypeError('Путь выходит за пределы сайта.');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
