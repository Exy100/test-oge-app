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
  'builds real collection routes, prerequisites, completion control and ordered lesson navigation',
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'oge-materials-build-'));
    try {
      await symlink(
        join(project, 'node_modules'),
        join(root, 'node_modules'),
        'dir',
      );
      for (const path of [
        'package.json',
        'tsconfig.json',
        'astro.config.mjs',
        'coverage.config.ts',
        'scripts',
        'src',
        'public',
      ])
        await cp(join(project, path), join(root, path), { recursive: true });
      await rm(join(root, 'src/pages'), { recursive: true });
      await cp(
        join(project, 'src/pages/materials'),
        join(root, 'src/pages/materials'),
        { recursive: true },
      );
      await mkdir(join(root, 'src/interactives'), { recursive: true });
      await cp(
        join(project, 'src/dev/InteractiveProbe.tsx'),
        join(root, 'src/interactives/BuildProbe.tsx'),
      );
      await mkdir(join(root, 'src/content/lessons/i1'), { recursive: true });
      // Reuse the working gallery, including generated examples and five real questions.
      const gallery = (
        await readFile(join(project, 'src/dev/lesson-components.mdx'), 'utf8')
      )
        .replaceAll("'../components/", "'../../../components/")
        .replace("import { lesson, links } from './lesson-data';", '')
        .replace(
          '<LessonHeader lesson={lesson} lessons={links} />',
          '<LessonHeader lesson={frontmatter} />',
        )
        .replace(
          '</Theory>',
          '<svg role="img" viewBox="0 0 80 24"><title>Один байт</title><text x="0" y="18">8 бит</text></svg>\n<svg role="img" viewBox="0 0 80 24"><title>Два байта</title><text x="0" y="18">16 бит</text></svg>\n</Theory>\n<Interactive id="build-probe" title="Биты" goal="Сопоставь биты и байты." controls="Tab и Enter." taskNumbers={[1]} modulePath="/src/interactives/BuildProbe.tsx"><p>В байте восемь бит.</p></Interactive>',
        );
      for (const [id, title, prerequisites] of [
        ['z-foundation', 'Ядро маршрута', []],
        ['a-follow-up', 'Алгоритм повторения', ['z-foundation']],
      ]) {
        const frontmatter = [
          '---',
          'id: ' + id,
          'title: ' + title,
          'section: i1',
          'taskNumbers: [1, 2, 3, 13]',
          'readingMinutes: 7',
          'prerequisites: ' + JSON.stringify(prerequisites),
          '---',
        ];
        await writeFile(
          join(root, 'src/content/lessons/i1', id + '.mdx'),
          frontmatter.join('\n') +
            '\nimport Interactive from "../../../components/lessons/Interactive.astro";\n' +
            gallery,
        );
      }
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
      const first = await readFile(
        join(root, 'dist/materials/i1/z-foundation/index.html'),
        'utf8',
      );
      const second = await readFile(
        join(root, 'dist/materials/i1/a-follow-up/index.html'),
        'utf8',
      );
      const catalog = await readFile(
        join(root, 'dist/materials/index.html'),
        'utf8',
      );
      const foundation = '/test-oge-app/materials/i1/z-foundation/';
      const followUp = '/test-oge-app/materials/i1/a-follow-up/';
      expect(first).toContain('Ядро маршрута');
      expect(first).toContain('Урок пройден');
      expect(first).toContain(`href="${followUp}" rel="next"`);
      expect(second).toContain(`href="${foundation}" rel="prev"`);
      expect(second).toContain('Перед началом повтори');
      expect(catalog.indexOf(`href="${foundation}"`)).toBeLessThan(
        catalog.indexOf(`href="${followUp}"`),
      );
      expect(catalog).toContain('Пройдено уроков в этом списке:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
