import { cp, mkdir, rm } from 'node:fs/promises';
import { SITE_BASE } from '../src/lib/site.ts';

const root = new URL('../.cache/pages/', import.meta.url);
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await cp(
  new URL('../dist/', import.meta.url),
  new URL(SITE_BASE.slice(1), root),
  { recursive: true },
);
await cp(
  new URL('../dist/_headers', import.meta.url),
  new URL('_headers', root),
);
