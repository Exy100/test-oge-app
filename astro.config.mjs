import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { SITE_ORIGIN, SITE_BASE } from './src/lib/site.ts';
import { writeSecurityHeaders } from './scripts/security-headers.mjs';
import { readFileSync } from 'node:fs';

export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,
  output: 'static',
  devToolbar: { enabled: false },
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
              pattern: '/dev/generators',
              entrypoint: './src/dev/generators.astro',
            });
            injectRoute({
              pattern: '/dev/figures',
              entrypoint: './src/dev/figures.astro',
            });
            injectRoute({
              pattern: '/dev/rich-text',
              entrypoint: './src/dev/rich-text.astro',
            });
            injectRoute({
              pattern: '/dev/ui',
              entrypoint: './src/dev/ui.astro',
            });
          }
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    preview:
      process.env.OGE_TEST_HTTPS === '1'
        ? {
            https: {
              key: readFileSync(
                new URL('./.cache/test-tls/key.pem', import.meta.url),
              ),
              cert: readFileSync(
                new URL('./.cache/test-tls/cert.pem', import.meta.url),
              ),
            },
          }
        : {},
  },
  build: { inlineStylesheets: 'never' },
});
