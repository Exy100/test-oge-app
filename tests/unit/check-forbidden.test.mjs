import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  checkForbidden,
  inspectSource,
} from '../../scripts/check-forbidden.mjs';

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oge-forbidden-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function file(path, source) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), source);
}

describe('forbidden source patterns', () => {
  it('checks actual Astro frontmatter and script code at their original lines', () => {
    const findings = inspectSource(
      'src/pages/test.astro',
      '---\nconst value: any = 1;\n---\n<p>any</p>\n<script>const second: any = 2;</script>',
    );
    expect(findings.map((item) => [item.rule, item.line])).toEqual([
      ['any-type', 2],
      ['any-type', 5],
    ]);
  });

  it('rejects an always-empty component but permits conditional rendering', () => {
    expect(
      inspectSource(
        'src/components/Card.tsx',
        'export const Card = () => null;',
      )[0].rule,
    ).toBe('empty-component');
    expect(
      inspectSource(
        'src/components/Card.tsx',
        'export const Card = () => <></>;',
      )[0].rule,
    ).toBe('empty-component');
    expect(
      inspectSource(
        'src/components/Card.tsx',
        'export const Card = ({ visible }: {visible: boolean}) => visible ? <p>Текст</p> : null;',
      ),
    ).toEqual([]);
  });
  it.each([
    'ToDo',
    'fixME',
    'xXx',
    'Lorem\nIpsum',
    'COMING SOON',
    'СкОрО',
    'В РАЗРАБОТКЕ',
  ])('finds markers case-insensitively: %s', (marker) => {
    const findings = inspectSource(
      'src/content/lesson.mdx',
      'Заголовок\n' + marker,
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        file: 'src/content/lesson.mdx',
        line: 2,
        rule: 'unfinished',
      }),
    );
  });

  it('does not confuse words, links or ordinary strings with forbidden code', () => {
    expect(
      inspectSource(
        'src/lib/value.ts',
        'export const values = ["any", "Math.random", "test.only", "скорость", "todoList", "xxxlarge", "https://fipi.ru"];',
      ),
    ).toEqual([]);
    expect(
      inspectSource(
        'src/content/lesson.mdx',
        'Скорость передачи данных. [Источник](https://fipi.ru)',
      ),
    ).toEqual([]);
  });

  it.each([
    'it.skip("x", () => 1)',
    'test.only.each([1])("x", () => 1)',
    'describe["only"]("x", () => 1)',
    'import { test as scenario } from "vitest"; scenario.skip("x", () => 1)',
    'import * as suite from "vitest"; suite.test.only("x", () => 1)',
  ])('finds actual disabled tests: %s', (source) => {
    expect(
      inspectSource('tests/unit/subject.test.ts', source).some(
        (item) => item.rule === 'disabled-test',
      ),
    ).toBe(true);
  });

  it('allows negative-test literals but still checks test comments and code', () => {
    const source =
      'const input = "TODO @ts-ignore test.only";\n// FIXME\nconst broken: any = 1;';
    const findings = inspectSource('tests/unit/input.test.ts', source);
    expect(findings.map((item) => [item.rule, item.line])).toEqual([
      ['unfinished', 2],
      ['any-type', 3],
    ]);
  });

  it.each([
    'Math.random()',
    'Math["random"]()',
    'const { random: sample } = Math;',
  ])('rejects non-seeded randomness in core: %s', (source) => {
    expect(
      inspectSource('src/core/rng.ts', source).some(
        (item) => item.rule === 'random',
      ),
    ).toBe(true);
    expect(inspectSource('src/components/color.ts', source)).toEqual([]);
  });

  it('requires documented lint exceptions and real type-test context', () => {
    expect(
      inspectSource(
        'src/lib/value.ts',
        '// @ts-ignore\nconst value: any = 1;',
      ).map((item) => item.rule),
    ).toEqual(['type-suppression', 'any-type']);
    expect(
      inspectSource('src/lib/value.ts', '// @ts-expect-error expected error'),
    ).toHaveLength(1);
    expect(
      inspectSource(
        'tests/unit/type.test.ts',
        '// @ts-expect-error: rejects the wrong input type\nconst value: string = 1;',
      ),
    ).toEqual([]);
    const source =
      '// eslint-disable-next-line no-console -- ADR-099\nconsole.log(1);';
    expect(
      inspectSource(
        'tests/unit/type.test.mjs',
        '// @ts-expect-error: ignored by unchecked JavaScript',
      ),
    ).toHaveLength(1);
    expect(inspectSource('src/lib/value.ts', source)).toHaveLength(1);
    expect(
      inspectSource(
        'src/lib/value.ts',
        source,
        '## ADR-099. Exception\nAllowed for src/lib/value.ts.',
      ),
    ).toEqual([]);
  });

  it('detects empty handlers, abbreviated code and unimplemented errors', () => {
    expect(
      inspectSource(
        'src/lib/work.ts',
        'export const run = () => {};\n// … остальное аналогично\nthrow new Error("not implemented");',
      ).map((item) => item.rule),
    ).toEqual(['empty-function', 'abbreviated-code', 'unimplemented']);
  });

  it('finds external runtime assets and cookies without echoing secrets', () => {
    expect(
      inspectSource(
        'src/pages/index.astro',
        '<script src="https://example.com/code.js"></script>',
      )[0].rule,
    ).toBe('external-script');
    expect(
      inspectSource(
        'src/styles/font.css',
        '@font-face { src: url(https://example.com/font.woff2); }',
      )[0].rule,
    ).toBe('external-font');
    expect(
      inspectSource('src/lib/cookie.ts', 'document.cookie = "name=value";')[0]
        .rule,
    ).toBe('cookies');
    const token = ['sk', 'or', 'v1', 'a'.repeat(20)].join('-');
    const findings = inspectSource(
      'src/lib/key.ts',
      'export const key = "' + token + '";',
    );
    expect(findings[0].rule).toBe('secret');
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it('scans production, Worker and tests but not archive, build or documentation', async () => {
    await file('src/core/a.ts', '// TODO');
    await file('worker/src/b.ts', '// FIXME');
    await file('tests/c.test.ts', 'test.only("x", () => 1);');
    await file('docs/archive/old.ts', '// TODO');
    await file('dist/client.js', '// TODO');
    const result = await checkForbidden(root);
    expect(result.files).toBe(3);
    expect(result.findings).toHaveLength(3);
  });

  it('does not follow symbolic links', async () => {
    await file('src/safe.ts', 'export const value = 1;');
    await symlink(join(root, 'src/safe.ts'), join(root, 'src/alias.ts'));
    await expect(checkForbidden(root)).rejects.toThrow('Символическая ссылка');
  });

  it('rejects a symbolic link used as a source root', async () => {
    await file('elsewhere/safe.ts', 'export const value = 1;');
    await symlink(join(root, 'elsewhere'), join(root, 'src'));
    await expect(checkForbidden(root)).rejects.toThrow('Символическая ссылка');
  });

  it('CLI fails on a TODO with file:line and succeeds after fixing the source', async () => {
    await file('src/task.ts', '// heading\n// TODO');
    const script = fileURLToPath(
      new URL('../../scripts/check-forbidden.mjs', import.meta.url),
    );
    const failed = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('src/task.ts:2: unfinished');
    await file('src/task.ts', 'export const task = 1;');
    const passed = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(passed.status).toBe(0);
    expect(passed.stdout).toContain('нарушений: 0');
  });
});
