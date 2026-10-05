import { cp, readdir, rm } from 'node:fs/promises';

// T1.1 publishes only the existing home page. Reject new routes until the
// publishing workflow is expanded, rather than silently omit them.
const published = ['index.html', '_astro', 'favicon.svg', '.nojekyll'];
const entries = await readdir(new URL('../dist/', import.meta.url));
if (entries.some((entry) => !published.includes(entry))) {
  throw new Error('Новые файлы dist требуют обновления публикации Pages.');
}
if (published.some((entry) => !entries.includes(entry))) {
  throw new Error('Сборка неполная. Сначала выполни npm run build.');
}
for (const entry of published) {
  const target = new URL(`../${entry}`, import.meta.url);
  if (entry === '_astro') await rm(target, { recursive: true, force: true });
  await cp(new URL(`../dist/${entry}`, import.meta.url), target, {
    recursive: true,
  });
}
console.log('Готовая страница скопирована в main / (root) для GitHub Pages.');
