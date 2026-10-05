import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { SITE_ORIGIN, SITE_BASE } from './src/lib/site.ts';

export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), mdx()],
  vite: { plugins: [tailwindcss()] },
  build: { inlineStylesheets: 'never' },
});
