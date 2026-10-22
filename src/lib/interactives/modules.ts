import { loadInteractive } from './module';

// Resolve entry URLs in the client build: URLs emitted by the SSR build are removed.
const entries = import.meta.glob<string>('/src/interactives/**/*.tsx', {
  query: '?module-url',
  import: 'default',
  eager: true,
});
if (import.meta.env.DEV)
  Object.assign(
    entries,
    import.meta.glob<string>('/src/dev/InteractiveProbe.tsx', {
      query: '?module-url',
      import: 'default',
      eager: true,
    }),
  );

export async function loadInteractivePath(path: string) {
  const url = entries[path];
  if (!url) throw new Error('Не найден модуль интерактива.');
  return loadInteractive(url);
}
