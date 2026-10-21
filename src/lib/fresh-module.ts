/** WebKit can retain failed imports across navigation; each load needs a fresh URL. */
export function importFreshModule<T>(entryUrl: string): Promise<T> {
  const url = new URL(entryUrl, window.location.href);
  url.searchParams.set('load', crypto.randomUUID());
  return import(/* @vite-ignore */ url.href) as Promise<T>;
}
