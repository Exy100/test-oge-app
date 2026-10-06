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
  integrations: [
    react(),
    mdx(),
    {
      name: 'development-ui',
      hooks: {
        'astro:config:setup': ({ command, injectRoute }) => {
          if (command === 'dev') {
            injectRoute({
              pattern: '/dev/ui',
              entrypoint: './src/dev/ui.astro',
            });
          }
        },
      },
    },
  ],
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
  build: { inlineStylesheets: 'never' },
});
