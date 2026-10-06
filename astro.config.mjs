import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { SITE_ORIGIN, SITE_BASE } from './src/lib/site.ts';
import { writeSecurityHeaders } from './scripts/security-headers.mjs';

export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,
  output: 'static',
  trailingSlash: 'always',
  markdown: { syntaxHighlight: 'prism' },
  security: {
    csp: {
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ],
    },
  },
  integrations: [
    react(),
    mdx(),
    {
      name: 'security-headers',
      hooks: {
        'astro:build:done': ({ dir }) => writeSecurityHeaders(dir),
      },
    },
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
