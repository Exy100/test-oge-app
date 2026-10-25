import { expect, it } from 'vitest';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const project = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);

it(
  'builds the MDX wrapper with a separate lazy scene chunk and its default export',
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'oge-interactive-build-'));
    try {
      await symlink(
        join(project, 'node_modules'),
        join(root, 'node_modules'),
        'dir',
      );
      await mkdir(join(root, 'src/pages'), { recursive: true });
      for (const path of [
        'tsconfig.json',
        'package.json',
        'astro.config.mjs',
        'public/_headers',
        'scripts/lazy-module-url.mjs',
        'scripts/security-headers.mjs',
        'src/lib/site.ts',
        'src/components/lessons/Interactive.astro',
        'src/components/lessons/InteractiveHost.tsx',
        'src/components/useHydrated.ts',
        'src/lib/fresh-module.ts',
        'src/lib/print-details.ts',
        'src/lib/interactives',
        'src/styles/interactives.css',
      ]) {
        await mkdir(join(root, path, '..'), { recursive: true });
        await cp(join(project, path), join(root, path), { recursive: true });
      }
      await mkdir(join(root, 'src/dev'), { recursive: true });
      await mkdir(join(root, 'src/interactives'), { recursive: true });
      await cp(
        join(project, 'src/dev/InteractiveProbe.tsx'),
        join(root, 'src/interactives/BuildProbe.tsx'),
      );
      await writeFile(
        join(root, 'src/dev/interactive-fixture.mdx'),
        [
          "import Interactive from '../components/lessons/Interactive.astro';",
          '',
          '<Interactive id="bits-build" title="Биты" goal="Сопоставь биты и байты." controls="Tab и Enter." taskNumbers={[1]} modulePath="/src/interactives/BuildProbe.tsx">',
          '<p>В одном байте восемь бит.</p>',
          '</Interactive>',
        ].join('\n'),
      );
      await writeFile(
        join(root, 'src/pages/index.astro'),
        [
          '---',
          "import Content from '../dev/interactive-fixture.mdx';",
          '---',
          '<html lang="ru"><head><meta charset="UTF-8" /><title>Проверка интерактива</title></head><body><Content /></body></html>',
        ].join('\n'),
      );
      await exec(
        process.execPath,
        [join(project, 'node_modules/astro/bin/astro.mjs'), 'build'],
        {
          cwd: root,
          env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
          maxBuffer: 2 * 1024 * 1024,
        },
      ).catch((error) => {
        throw new Error(error.stdout + error.stderr, { cause: error });
      });
      const html = await readFile(join(root, 'dist/index.html'), 'utf8');
      expect(html).toContain('client="visible"');
      expect(html).toContain('В одном байте восемь бит.');
      expect(html).not.toContain('data-probe-ready');
      expect(html).toContain('/src/interactives/BuildProbe.tsx');
      const host = html.match(/component-url="([^"]+)"/u)?.[1];
      expect(host).toMatch(/^\/test-oge-app\/_astro\//u);
      const hostChunk = await readFile(
        join(root, 'dist', host.replace('/test-oge-app/', '')),
        'utf8',
      );
      const scene = hostChunk.match(/BuildProbe\.[\w-]+\.js/u)?.[0];
      expect(scene).toBeDefined();
      const chunk = await readFile(join(root, 'dist/_astro', scene), 'utf8');
      expect(chunk).toMatch(/\bexport\s*(?:\{[^}]*\bdefault\b|default\b)/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
