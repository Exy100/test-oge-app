import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
import config from '../../coverage.config.ts';
import { lessonFixture, withoutBlock } from '../fixtures/lesson.mjs';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(project, 'node_modules/astro/bin/astro.mjs');
let root;

async function file(path, source) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), source);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oge-lesson-build-'));
  await symlink(
    join(project, 'node_modules'),
    join(root, 'node_modules'),
    'dir',
  );
  await file('package.json', JSON.stringify({ type: 'module' }));
  await file(
    'astro.config.mjs',
    "import mdx from '@astrojs/mdx'; export default { integrations: [mdx()] };",
  );
  await file(
    'src/content.config.ts',
    `export { collections } from ${JSON.stringify(join(project, 'src/content.config.ts'))};`,
  );
  await file(
    'src/pages/index.astro',
    [
      '---',
      "import { getCollection } from 'astro:content';",
      "const lessons = await getCollection('lessons');",
      '---',
      '<html lang="ru"><head><title>Проверка коллекции</title></head><body>',
      '<p>{lessons.map((lesson) => `${lesson.id}|${lesson.data.readingMinutes}`).join(",")}</p>',
      '</body></html>',
    ].join('\n'),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function build() {
  try {
    const result = await exec(process.execPath, [cli, 'build'], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
      maxBuffer: 2 * 1024 * 1024,
    });
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    if (error.code !== 1) throw error;
    return { code: error.code, output: error.stdout + error.stderr };
  }
}

describe('Astro lesson collection build', { timeout: 30_000 }, () => {
  it('loads metadata with the frontmatter ID and revalidates cached entries', async () => {
    await file(
      'src/content/lessons/i1/different-filename.mdx',
      lessonFixture(),
    );
    const valid = await build();
    expect(valid.output).not.toContain('lesson:');
    expect(valid.code, valid.output).toBe(0);
    expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toContain(
      'bits|5',
    );
    // A cache hit must still enforce body requirements on the next build.
    const second = await build();
    expect(second.code, second.output).toBe(0);
    await file(
      'src/content/lessons/i1/different-filename.mdx',
      withoutBlock(lessonFixture(), 'Quiz'),
    );
    const invalid = await build();
    expect(invalid.code).toBe(1);
    expect(invalid.output).toContain('Нет блока Quiz.');
  });

  it.each(config.lessons.blocks)(
    'fails the real build without %s',
    async (block) => {
      await file(
        'src/content/lessons/i1/bits.mdx',
        withoutBlock(lessonFixture(), block),
      );
      const result = await build();
      expect(result.code).toBe(1);
      expect(result.output).toContain('Нет блока ' + block + '.');
    },
  );

  it.each([
    ['<Figure id="first" />', 'Theory: нужно не менее 2'],
    ['<Example id="one" />', 'Examples: нужно не менее 3'],
    ['<Mistake>Первая ошибка.</Mistake>', 'Mistakes: нужно не менее 3'],
    ['<Question id="a" />', 'Quiz: нужно не менее 5'],
  ])(
    'fails the real build below the minimum after removing %s',
    async (part, message) => {
      await file(
        'src/content/lessons/i1/bits.mdx',
        lessonFixture().replace(part, ''),
      );
      const result = await build();
      expect(result.code).toBe(1);
      expect(result.output).toContain(message);
    },
  );

  it('rejects a static interactive replacement during the build', async () => {
    await file(
      'src/content/lessons/i1/bits.mdx',
      lessonFixture('bits', 'i1', true),
    );
    const result = await build();
    expect(result.code).toBe(1);
    expect(result.output).toContain('InteractiveFallback запрещён');
  });

  it('rejects malformed frontmatter and collection references', async () => {
    const path = 'src/content/lessons/i1/bits.mdx';
    await file(
      path,
      lessonFixture().replace('readingMinutes: 5', 'readingMinutes: 0'),
    );
    const metadata = await build();
    expect(metadata.code).toBe(1);
    expect(metadata.output).toContain('readingMinutes');
    await file(
      path,
      lessonFixture().replace('prerequisites: []', 'prerequisites: [missing]'),
    );
    const prerequisite = await build();
    expect(prerequisite.code).toBe(1);
    expect(prerequisite.output).toContain('пререквизит missing');
    await file(path, lessonFixture());
    await file('src/content/lessons/i2/copy.mdx', lessonFixture());
    const duplicate = await build();
    expect(duplicate.code).toBe(1);
    expect(duplicate.output).toContain('Повтор идентификатора bits');
  });
});
