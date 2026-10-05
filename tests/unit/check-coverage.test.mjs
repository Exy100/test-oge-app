import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import config from '../../coverage.config.ts';
import { checkCoverage, parsePhase } from '../../scripts/check-coverage.mjs';
import { readLesson } from '../../scripts/quality/lessons.mjs';

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oge-coverage-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function file(path, source) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), source);
}

function lesson(id = 'bits', section = 'i1', fallback = false) {
  return [
    '---',
    'id: ' + id,
    'title: Учебный пример',
    'section: ' + section,
    'taskNumbers: [1]',
    'readingMinutes: 5',
    'prerequisites: []',
    '---',
    '<LessonHeader />',
    '',
    '<Motivation>Как измерить информацию в сообщении.</Motivation>',
    '',
    '<Theory>Объяснение темы. <Figure id="first" /> <Figure id="second" /></Theory>',
    '',
    fallback
      ? '<InteractiveFallback id="bits-and-bytes"><Figure id="static" /></InteractiveFallback>'
      : '<Interactive id="bits-and-bytes" />',
    '',
    '<Examples><Example id="one" /><Example id="two" /><Example id="three" /></Examples>',
    '',
    '<Mistakes><Mistake>Первая ошибка.</Mistake><Mistake>Вторая ошибка.</Mistake><Mistake>Третья ошибка.</Mistake></Mistakes>',
    '',
    '<Quiz><Question id="a" /><Question id="b" /><Question id="c" /><Question id="d" /><Question id="e" /></Quiz>',
    '',
    '<StreamLink />',
    '',
    '<CheatSheet>Правило вычисления объёма.</CheatSheet>',
    '',
  ].join('\n');
}

async function stageThree() {
  const generators = Object.entries(config.generators).flatMap(
    ([number, minimum]) =>
      Array.from(
        { length: minimum },
        (_, i) =>
          '{ id: "g' +
          number +
          '-' +
          i +
          '", taskNumber: ' +
          number +
          ', subtype: "type-' +
          i +
          '", generate: (seed) => ({ seed }), verify: (task) => typeof task.seed === "string" }',
      ),
  );
  await file(
    config.sources.generators,
    'export const generators = [' + generators.join(',') + '];',
  );
  const banks = Object.entries(config.banks).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, i) => ({
      id: kind + '-' + i,
      taskNumber: 13,
      variant13: kind,
      datasetId: 'data-' + i,
      answer: { type: 'artifact', kind, referenceId: kind + '-ref-' + i },
      criteria: { max: 2 },
    })),
  );
  await file(
    config.sources.banks,
    'export const bankTasks = ' + JSON.stringify(banks) + ';',
  );
  await file(
    config.sources.variants,
    'export const fixedVariants = ' +
      JSON.stringify(
        config.variants.requiredIds.map((id) => ({ id, seed: 'seed-' + id })),
      ) +
      '; export const buildVariant = (seed) => ({ seed });',
  );
}

async function interactiveRegistry() {
  const entries = Object.entries(config.interactives).flatMap(
    ([kind, settings]) =>
      settings.requiredIds.map(
        (id) =>
          '{ id: "' +
          id +
          '", kind: "' +
          kind +
          '", load: () => Promise.resolve({ fixture: true }), levels: [{id: "one"}, {id: "two"}, {id: "three"}] }',
      ),
  );
  await file(
    config.sources.interactives,
    'export const interactives = [' + entries.join(',') + '];',
  );
}

async function allLessons(fallback = false) {
  for (const [section, count] of Object.entries(config.lessons.sections))
    for (let i = 0; i < count; i++)
      await file(
        config.sources.lessons + '/' + section + '/' + i + '.mdx',
        lesson(section + '-' + i, section, fallback),
      );
}

describe('coverage configuration and phase checks', () => {
  it('keeps the exact product minima, without substituting overall totals for per-number limits', () => {
    expect(config.generators).toEqual({
      1: 4,
      2: 4,
      3: 4,
      4: 4,
      5: 4,
      6: 4,
      7: 4,
      8: 4,
      9: 4,
      10: 4,
      11: 3,
      12: 3,
      14: 4,
      15: 4,
      16: 4,
    });
    expect(Object.values(config.generators).reduce((a, b) => a + b, 0)).toBe(
      58,
    );
    expect(config.banks).toEqual({ presentation: 12, document: 12 });
    expect(Object.values(config.lessons.sections)).toEqual([
      3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 3, 4,
    ]);
    expect(config.lessons.minimum).toBe(45);
    expect([
      config.lessons.visualizations,
      config.lessons.interactives,
      config.lessons.examples,
      config.lessons.mistakes,
      config.lessons.quizQuestions,
    ]).toEqual([2, 1, 3, 3, 5]);
    expect(config.interactives['2d'].requiredIds).toHaveLength(18);
    expect(config.interactives['3d'].requiredIds).toHaveLength(5);
    expect(config.interactives['3d'].levelsPerGame).toBe(3);
    expect(config.variants.minimum).toBe(10);
  });

  it('parses supported phase flags and rejects malformed or duplicate flags', () => {
    expect(parsePhase([])).toBe(config.currentPhase);
    expect(parsePhase(['--phase=final'])).toBe(10);
    expect(parsePhase(['--phase', '7'])).toBe(7);
    for (const args of [
      ['--phase=3x'],
      ['--phase=11'],
      ['--phase=-1'],
      ['--phase='],
      ['--wat'],
      ['--phase=1', '--phase=final'],
    ])
      expect(() => parsePhase(args)).toThrow();
  });

  it('reports zero real content at phase 1; future minima stay visible and fail when due', async () => {
    const early = await checkCoverage(root, 1);
    expect(early.findings).toEqual([]);
    expect(
      early.metrics.every(
        (item) => item.actual === 0 && !item.required && item.minimum > 0,
      ),
    ).toBe(true);
    const final = await checkCoverage(root, 10);
    expect(
      final.findings.some((item) =>
        item.message.includes('Обязательный реестр отсутствует'),
      ),
    ).toBe(true);
    expect(final.metrics.every((item) => item.required)).toBe(true);
  });

  it('reads imported generator implementations from the real registry and rejects repeated subtypes', async () => {
    await file(
      'src/core/generators/one.ts',
      'export const one = {id: "first", taskNumber: 1, subtype: "text", generate: (seed) => ({ seed }), verify: (task) => Boolean(task)};',
    );
    await file(
      config.sources.generators,
      'import { one } from "./one.ts"; export const generators = [one, {...one, id: "second"}];',
    );
    const result = await checkCoverage(root, 1);
    expect(
      result.metrics.find((item) => item.label === '№1: подтипы').actual,
    ).toBe(1);
    expect(
      result.findings.some((item) =>
        item.message.includes('Повтор подтипа 1:text'),
      ),
    ).toBe(true);
  });

  it('rejects malformed registries even before their minimum becomes mandatory', async () => {
    await file(
      config.sources.generators,
      'export const generators = [ {id: "data-only", taskNumber: 1, subtype: "text"} ];',
    );
    await file(config.sources.banks, 'export const bankTasks = {};');
    const result = await checkCoverage(root, 1);
    expect(result.findings).toHaveLength(2);
    expect(
      result.metrics.find((item) => item.label === '№1: подтипы').actual,
    ).toBe(0);
  });

  it('accepts phase 3 quantities and keeps lessons deferred until phase 7', async () => {
    await stageThree();
    expect((await checkCoverage(root, 3)).findings).toEqual([]);
    const seven = await checkCoverage(root, 7);
    expect(seven.findings.some((item) => item.message === 'Уроки: 0/45.')).toBe(
      true,
    );
  });

  it('does not inflate curated banks with duplicate datasets or mix the two alternatives', async () => {
    const item = {
      id: 'first',
      taskNumber: 13,
      variant13: 'presentation',
      datasetId: 'same',
      answer: { type: 'artifact', kind: 'presentation', referenceId: 'ref' },
      criteria: { max: 2 },
    };
    await file(
      config.sources.banks,
      'export const bankTasks = ' +
        JSON.stringify([item, { ...item, id: 'second' }]) +
        ';',
    );
    const result = await checkCoverage(root, 1);
    expect(
      result.metrics.find((metric) => metric.label === '№13: presentation')
        .actual,
    ).toBe(1);
    expect(
      result.metrics.find((metric) => metric.label === '№13: document').actual,
    ).toBe(0);
    expect(
      result.findings.some((finding) =>
        finding.message.includes('Повтор набора'),
      ),
    ).toBe(true);
  });

  it('accepts a complete final fixture and reads only actual lesson files, excluding the archive', async () => {
    await stageThree();
    await interactiveRegistry();
    await allLessons();
    await file(
      'docs/archive/mathematics/lesson.mdx',
      'invalid historical content',
    );
    await file('src/content/welcome.mdx', '# Приветствие');
    const result = await checkCoverage(root, 10);
    expect(result.findings).toEqual([]);
    expect(result.metrics.find((item) => item.label === 'Уроки').actual).toBe(
      45,
    );
    expect(result.deferred).toEqual([]);
  });

  it('reports static replacements in phase 7 and rejects every replacement at phase 8', async () => {
    await stageThree();
    await allLessons(true);
    const seven = await checkCoverage(root, 7);
    expect(seven.findings).toEqual([]);
    expect(seven.deferred).toHaveLength(45);
    await interactiveRegistry();
    const eight = await checkCoverage(root, 8);
    expect(
      eight.findings.filter((item) =>
        item.message.includes('временную замену'),
      ),
    ).toHaveLength(45);
  });

  it('rejects missing prerequisites and unknown interactive references', async () => {
    await file(
      config.sources.lessons + '/i1/bits.mdx',
      lesson().replace('prerequisites: []', 'prerequisites: [missing]'),
    );
    const result = await checkCoverage(root, 1);
    expect(
      result.findings.some((item) =>
        item.message.includes('пререквизит missing'),
      ),
    ).toBe(true);
    expect(
      result.findings.some((item) =>
        item.message.includes('Неизвестный интерактив'),
      ),
    ).toBe(true);
  });

  it('counts distinct 3D levels and requires the specific catalog, not just any 5 games', async () => {
    await file(
      config.sources.interactives,
      'export const interactives = [{id: "unrelated", kind: "3d", load: () => Promise.resolve(1), levels: [{id: "one"}, {id: "one"}, {id: "one"}]}];',
    );
    const result = await checkCoverage(root, 8);
    expect(
      result.findings.some((item) =>
        item.message.includes('уникальные уровни'),
      ),
    ).toBe(true);
    expect(
      result.findings.some((item) => item.message.includes('bit-warehouse')),
    ).toBe(true);
  });

  it('CLI returns nonzero for missing final content and invalid flags', () => {
    const script = fileURLToPath(
      new URL('../../scripts/check-coverage.mjs', import.meta.url),
    );
    const result = spawnSync(process.execPath, [script, '--phase=final'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/core/generators/index.ts:1: coverage');
    expect(
      spawnSync(process.execPath, [script, '--phase=oops'], {
        cwd: root,
        encoding: 'utf8',
      }).status,
    ).toBe(1);
  });
});

describe('lesson structure, parsed as MDX without evaluating it', () => {
  const read = (source) =>
    readLesson('src/content/lessons/i1/bits.mdx', source, config.lessons);
  it('accepts a complete ordered lesson', () => {
    expect(read(lesson()).findings).toEqual([]);
  });
  it.each(config.lessons.blocks)(
    'rejects a missing required block: %s',
    (block) => {
      const source = lesson().replace(
        new RegExp(
          '<' +
            block +
            '(?:\\s[^>]*)?\\s*/>|<' +
            block +
            '\\b[^>]*>[\\s\\S]*?</' +
            block +
            '>',
          'u',
        ),
        '',
      );
      expect(
        read(source).findings.some(
          (item) => item.message === 'Нет блока ' + block + '.',
        ),
      ).toBe(true);
    },
  );
  it('rejects reordered blocks', () => {
    const source = lesson()
      .replace('<LessonHeader />', '')
      .replace('<StreamLink />', '<LessonHeader />\n<StreamLink />');
    expect(
      read(source).findings.some((item) => item.message.includes('порядок')),
    ).toBe(true);
  });
  it.each([
    '<Figure id="first" />',
    '<Example id="one" />',
    '<Mistake>Первая ошибка.</Mistake>',
    '<Question id="a" />',
  ])('rejects a block below its item minimum: %s', (part) => {
    expect(
      read(lesson().replace(part, '')).findings.some((item) =>
        item.message.includes('не менее'),
      ),
    ).toBe(true);
  });
  it('does not count component names inside code fences or comments', () => {
    const source = lesson().replace(
      '<Interactive id="bits-and-bytes" />',
      '```mdx\n<Interactive id="bits-and-bytes" />\n```\n\n{/* <Interactive id="bits-and-bytes" /> */}',
    );
    expect(
      read(source).findings.some(
        (item) => item.message === 'Нет блока Interactive.',
      ),
    ).toBe(true);
  });
  it('rejects malformed YAML, duplicate metadata and out-of-range task numbers', () => {
    expect(
      read(lesson().replace('readingMinutes: 5', 'readingMinutes: [')).findings,
    ).not.toEqual([]);
    expect(
      read(lesson().replace('title: Учебный пример', 'title: Один\ntitle: Два'))
        .findings,
    ).not.toEqual([]);
    expect(
      read(lesson().replace('taskNumbers: [1]', 'taskNumbers: [17]')).findings,
    ).not.toEqual([]);
  });
});
