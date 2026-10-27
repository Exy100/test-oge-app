import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { z } from '../../src/core/zod';
import { checkAnswer } from '../../src/core/checker';
import { shortestDistance } from '../../src/core/generators/04/roads';
import { compileRobot, runRobot } from '../../src/core/robot';
import { examConfig } from '../../src/core/exam/exam.config';
import { generators } from '../../src/core/generators';
import { streamSources } from '../../src/core/stream/catalog';
import {
  formatRows,
  pendingProductIntegrations,
} from '../fixtures/exam/matrix';
import {
  shortFixtures,
  answerFormat,
  type Year,
} from '../fixtures/exam/short-answers';
import { solveShort, sourceFiles } from '../fixtures/exam/solve-short';
import {
  officeFixtures,
  pythonFixtures,
  robotFixtures,
  publishedRobotCondition,
} from '../fixtures/exam/practice';
import { examRobotField } from '../fixtures/exam/robot-fields';
import {
  fieldFor,
  robotCases,
  type RobotKind,
} from '../../src/core/generators/15/fields';

const years: Year[] = [2025, 2026, 2027];
const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[0-9a-f]{64}$/u);
const stats = z.strictObject({
  files: z.number().int().positive(),
  bytes: z.number().int().positive(),
  maxFileBytes: z.number().int().positive(),
});
const sources = z
  .array(
    z.strictObject({
      year: z.number().int(),
      url: z.url(),
      archiveBytes: z.number().int().positive(),
      archiveSha256: sha,
      documents: z.array(
        z.strictObject({
          member: z.string(),
          bytes: z.number().int().positive(),
          sha256: sha,
        }),
      ),
      task11: stats,
      task12: stats,
      task14: z.strictObject({
        member: z.string(),
        bytes: z.number().int().positive(),
        sha256: sha,
        rows: z.number().int().positive(),
        projectionSha256: sha,
      }),
    }),
  )
  .parse(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/exam/data/sources.json', import.meta.url),
        'utf8',
      ),
    ),
  );

describe('official exam fixtures, with explicit separation from generated tasks', () => {
  it('links every fixture to a sourced format and a real product owner, without hiding pending integrations', () => {
    const all = [
      ...shortFixtures,
      ...officeFixtures,
      ...robotFixtures,
      ...pythonFixtures,
    ];
    const catalogue = streamSources();
    expect(new Set(formatRows.map((row) => row.id)).size).toBe(
      formatRows.length,
    );
    for (const fixture of all)
      expect(
        formatRows.some(
          (row) =>
            row.fixtureIds.includes(fixture.id) &&
            row.taskNumber === fixture.taskNumber,
        ),
      ).toBe(true);
    const plan = readFileSync(
      new URL('../../tasks.md', import.meta.url),
      'utf8',
    );
    for (const row of formatRows) {
      expect(row.fixtureIds.length).toBeGreaterThan(0);
      expect(plan).toContain(`${row.owner} `);
      for (const id of row.fixtureIds)
        expect(
          all.some(
            (fixture) =>
              fixture.id === id && fixture.taskNumber === row.taskNumber,
          ),
        ).toBe(true);
      for (const id of row.generatorIds)
        expect(
          catalogue.some(
            (source) =>
              source.generatorId === id && source.taskNumber === row.taskNumber,
          ),
        ).toBe(true);
      if (row.integration !== 'covered')
        expect(row.gap.length).toBeGreaterThan(20);
    }
    expect(pendingProductIntegrations).toEqual([]);
    expect(publishedRobotCondition.closesIn).toBe(
      formatRows.find((row) => row.id === 'M15')?.owner,
    );
    expect(plan).toContain(`${publishedRobotCondition.closesIn} `);
    expect(publishedRobotCondition.source).toBe(
      `D${String(publishedRobotCondition.year)}`,
    );
    expect(
      generators
        .filter((generator) => generator.taskNumber !== 13)
        .every((generator) =>
          formatRows.some((row) => row.taskNumber === generator.taskNumber),
        ),
    ).toBe(true);
  });
  it('covers every number in each of the three source years, both alternatives and unique IDs', () => {
    const all = [
      ...shortFixtures,
      ...officeFixtures,
      ...robotFixtures,
      ...pythonFixtures,
    ];
    expect(all).toHaveLength(51);
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    for (const year of years) {
      expect(
        Array.from(
          new Set(
            all
              .filter((item) => item.year === year)
              .map((item) => item.taskNumber),
          ),
        ).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
      expect(
        all.filter((item) => item.year === year && item.taskNumber === 13),
      ).toHaveLength(2);
    }
    expect(sources.map((source) => source.year)).toEqual(years);
    for (const source of sources) {
      expect(source.url).toBe(
        `https://doc.fipi.ru/oge/demoversii-specifikacii-kodifikatory/${String(source.year)}/inf_9_${String(source.year)}.zip`,
      );
      expect(source.documents).toHaveLength(2);
    }
  });
  for (const fixture of shortFixtures) {
    it(`${fixture.id}: independent solution and published answer format`, () => {
      const actual = solveShort(fixture);
      if (actual) {
        // Published alternative orders are equivalent only in the repeated-letter task.
        for (const answer of fixture.answers) {
          const comparable =
            fixture.parameters.kind === 'decode' &&
            fixture.parameters.repeatedOnly
              ? Array.from(answer).sort().join('')
              : answer;
          expect(actual.map((item) => item.toLowerCase())).toContain(
            comparable.toLowerCase(),
          );
        }
      } else expect(fixture.parameters.kind).toBe('file-search');
      const answer = fixture.answers[0] ?? '';
      const format = answerFormat(fixture);
      for (const alternative of fixture.answers)
        expect(checkAnswer(format, alternative).verdict).toBe('correct');
      expect(checkAnswer(format, answer)).toMatchObject({
        verdict: 'correct',
        counted: true,
      });
      expect(checkAnswer(format, '')).toMatchObject({
        verdict: 'format_error',
        counted: false,
      });
      if (fixture.format !== 'sequence')
        expect(checkAnswer(format, ` ${answer.toUpperCase()} `)).toMatchObject({
          verdict: 'correct',
        });
      if (fixture.parameters.kind === 'roads') {
        // Adapt labels to the existing six-vertex engine, padding an isolated vertex.
        const p = fixture.parameters;
        const names = [
          'A',
          ...new Set(
            p.edges
              .flatMap(([a, b]) => [a, b])
              .filter((x) => x !== 'A' && x !== p.end),
          ),
        ];
        while (names.length < 5) names.push(`unused-${String(names.length)}`);
        names.push(p.end);
        const roads = names.map(() => names.map(() => 0));
        for (const [a, b, length] of p.edges) {
          const row = roads[names.indexOf(a)],
            reverse = roads[names.indexOf(b)];
          if (!row || !reverse) throw new Error('Invalid road labels');
          row[names.indexOf(b)] = length;
          reverse[names.indexOf(a)] = length;
        }
        expect(String(shortestDistance(roads))).toBe(answer);
      }
    });
  }
  for (const year of years) {
    it(`D${String(year)}: file inventory and original spreadsheet answers`, () => {
      const source = sources.find((item) => item.year === year);
      if (!source) throw new Error('Missing source');
      const files = sourceFiles(year);
      expect(files).toHaveLength(source.task12.files);
      expect(new Set(files.map((item) => item.path)).size).toBe(files.length);
      expect(files.reduce((sum, file) => sum + file.size, 0)).toBe(
        source.task12.bytes,
      );
      expect(Math.max(...files.map((item) => item.size))).toBe(
        source.task12.maxFileBytes,
      );
      const raw = readFileSync(
        new URL(
          `../fixtures/exam/data/table-${String(year)}.csv`,
          import.meta.url,
        ),
        'utf8',
      );
      expect(hash(raw)).toBe(source.task14.projectionSha256);
      const rows = raw
        .trimEnd()
        .split('\n')
        .slice(1)
        .map((row) => row.split(','));
      expect(rows).toHaveLength(source.task14.rows);
      const fixture = officeFixtures.find(
        (item) => item.year === year && item.taskNumber === 14,
      );
      if (!fixture) throw new Error('Missing spreadsheet fixture');
      const r = fixture.requirements;
      if (year === 2025) {
        const women = rows.filter((row) => row[0] === 'жен');
        expect(women.filter((row) => row[1] === 'пенсионер')).toHaveLength(
          Number(r.count),
        );
        expect(
          Math.max(...rows.map((row) => Number(row[3]))) -
            Math.min(...rows.map((row) => Number(row[3]))),
        ).toBe(r.range);
        expect(
          ['пенсионер', 'студент', 'служащий'].map(
            (status) => women.filter((row) => row[1] === status).length,
          ),
        ).toEqual(r.chart);
      } else if (year === 2026) {
        expect(
          rows
            .filter((row) =>
              ['7 октября', '8 октября', '9 октября'].includes(row[0] ?? ''),
            )
            .reduce((sum, row) => sum + Number(row[3]), 0),
        ).toBe(r.distanceSum);
        const selected = rows.filter((row) => row[1] === 'Осинки');
        expect(
          Number(
            (
              selected.reduce((sum, row) => sum + Number(row[5]), 0) /
              selected.length
            ).toFixed(1),
          ),
        ).toBe(r.meanMass);
      } else {
        expect(
          rows.filter((row) => row[1] === '8' && Number(row[2]) > 210),
        ).toHaveLength(Number(r.count));
        const selected = rows.filter((row) => row[0] === '2');
        expect(
          Number(
            (
              selected.reduce((sum, row) => sum + Number(row[2]), 0) /
              selected.length
            ).toFixed(2),
          ),
        ).toBe(r.meanScore);
      }
    });
  }
  for (const fixture of robotFixtures) {
    it(`${fixture.id}: official algorithm runs in the actual Robot interpreter`, () => {
      expect(compileRobot(fixture.reference).length).toBeGreaterThan(0);
      for (const size of [1, 2, 4]) {
        const field = examRobotField(fixture.year, size);
        const result = runRobot(fixture.reference, field);
        expect(result.status).toBe('completed');
        expect(result.success).toBe(true);
        expect(result.painted).toEqual(
          [...field.targets].sort(
            (a, b) => a.row - b.row || a.column - b.column,
          ),
        );
      }
      const kind: RobotKind =
        fixture.year === 2025
          ? 'robot-corner-right'
          : fixture.year === 2026
            ? 'robot-corner-left'
            : 'robot-stairs';
      for (const parameters of robotCases(kind, 'official-fixture'))
        expect(runRobot(fixture.reference, fieldFor(parameters)).success).toBe(
          true,
        );
    });
  }
  it('accepts the published compound condition and five equivalent student spellings in BOTH independent executors', () => {
    const cases: {
      source: string;
      field: ReturnType<typeof examRobotField>;
    }[] = [];
    const simple = examRobotField(2027, 1);
    simple.rows = 3;
    simple.columns = 3;
    simple.start = { row: 1, column: 1 };
    simple.targets = [];
    simple.walls = [{ from: { row: 1, column: 1 }, to: { row: 2, column: 1 } }];
    expect(runRobot(publishedRobotCondition.program, simple).position).toEqual({
      row: 1,
      column: 2,
    });
    cases.push({ source: publishedRobotCondition.program, field: simple });
    for (const fixture of robotFixtures) {
      // Six correct whole algorithms, not merely six strings that parse.
      const forms = [
        fixture.reference,
        fixture.reference.replaceAll(
          /не (сверху|снизу|слева|справа) свободно/gu,
          '$1 стена',
        ),
        fixture.reference.replaceAll(
          /не (сверху|снизу|слева|справа) свободно/gu,
          'не ($1 свободно)',
        ),
        fixture.reference.replaceAll(
          /не (сверху|снизу|слева|справа) свободно/gu,
          'не не $1 стена',
        ),
        fixture.reference.replaceAll(/нц пока (.+)/gu, 'нц пока ($1) и ($1)'),
        fixture.reference.replaceAll(
          /нц пока (.+)/gu,
          'нц пока не (не ($1)) или (($1) и не ($1))',
        ),
      ];
      expect(new Set(forms).size).toBe(6);
      for (const source of forms) {
        const wrapped = `ИСПОЛЬЗОВАТЬ Робот\r\nалг решение\r\nнач\r\n${source.replaceAll('\n', '\r\n')}\r\nкон | конец`;
        const field = examRobotField(fixture.year, 2);
        expect(runRobot(wrapped, field).success).toBe(true);
        cases.push({ source: wrapped, field });
      }
    }
    cases.push({
      source:
        'нц 2 раз\nесли клетка не закрашена то\nзакрасить\nиначе\nесли справа свободно то\nвправо\nвсе\nвсе\nкц',
      field: simple,
    });
    // Exhaust all four directional booleans; the Python parser uses shunting yard,
    // not the production AST, and must agree on precedence and grouping.
    for (let mask = 0; mask < 16; mask++) {
      const field = {
        ...simple,
        walls: [
          { row: 0, column: 1 },
          { row: 2, column: 1 },
          { row: 1, column: 0 },
          { row: 1, column: 2 },
        ]
          .filter((_, i) => (mask & (2 ** i)) === 0)
          .map((to) => ({ from: simple.start, to })),
      };
      for (const condition of [
        'справа свободно или слева свободно и не сверху свободно',
        '(справа свободно или слева свободно) и не сверху свободно',
        'не не(снизу стена) и (сверху свободно или не слева свободно)',
      ])
        cases.push({ source: `если ${condition} то\nзакрасить\nвсе`, field });
    }
    const actual: unknown = JSON.parse(
      execFileSync('python3', ['scripts/check-robots.py', '--json'], {
        input: JSON.stringify(cases),
        encoding: 'utf8',
        timeout: 10000,
      }),
    );
    expect(actual).toEqual(
      cases.map(({ source, field }) => {
        const result = runRobot(source, field);
        expect(result.status).toBe('completed');
        return { painted: result.painted, position: result.position };
      }),
    );
    const invalid = [
      'справа свободно и',
      '()',
      'не',
      '(сверху свободно',
      'справа свободно) или слева стена',
      'сверху свободно снизу свободно',
    ];
    const rejected: unknown = JSON.parse(
      execFileSync('python3', ['scripts/check-robots.py', '--json'], {
        input: JSON.stringify(
          invalid.map((text) => ({
            source: `| заголовок\nесли ${text} то\nвсе`,
            field: simple,
          })),
        ),
        encoding: 'utf8',
        timeout: 10000,
      }),
    );
    const errors = z
      .array(z.strictObject({ error: z.string() }))
      .parse(rejected);
    expect(errors).toHaveLength(invalid.length);
    for (const result of errors)
      expect(result.error).toMatch(/Строка 2:.*Проверь/u);
    for (const text of invalid)
      expect(() => compileRobot(`| заголовок\nесли ${text} то\nвсе`)).toThrow(
        'Строка 2:',
      );
  });
  it('executes all published Python references on their official example and grading data', () => {
    const input = pythonFixtures.map((fixture) => ({
      code: fixture.reference,
      inputs: fixture.cases.map((item) => item.input),
    }));
    const actual = z.array(z.array(z.string())).parse(
      JSON.parse(
        execFileSync('python3', ['tests/fixtures/run-python16.py'], {
          input: JSON.stringify(input),
          encoding: 'utf8',
          timeout: 10000,
        }),
      ),
    );
    expect(actual).toEqual(
      pythonFixtures.map((fixture) => fixture.cases.map((item) => item.output)),
    );
    // Independent oracle uses a base string, not the reference's modular inequalities.
    for (const fixture of pythonFixtures)
      for (const example of fixture.cases) {
        const values = example.input.trim().split('\n').map(Number);
        let expected: number[];
        if (fixture.kind === 'positive-mean') {
          const count = values.shift();
          expect(count).toBe(values.length);
          const positive = values.filter((value) => value > 0);
          expected = [
            positive.reduce((sum, value) => sum + value, 0) / positive.length,
            positive.length,
          ];
        } else if (fixture.kind === 'base7-sum') {
          const count = values.shift();
          expect(count).toBe(values.length);
          expected = [
            values
              .filter((value) => value.toString(7).endsWith('1'))
              .reduce((sum, value) => sum + value, 0),
          ];
        } else {
          expect(values.pop()).toBe(0);
          expected = [
            values.filter((value) =>
              /^[1-7][0-7]{2}5$/u.test(value.toString(8)),
            ).length,
          ];
        }
        expect(example.output.trim().split(/\s+/u).map(Number)).toEqual(
          expected,
        );
      }
  });
  it('keeps official maxima and both №13 alternatives distinct', () => {
    for (const fixture of officeFixtures) {
      expect(fixture.maxScore).toBe(
        examConfig.tasks[fixture.taskNumber].maxScore,
      );
      expect(fixture.criteriaPages.length).toBeGreaterThan(0);
      if (fixture.variant13 === 'presentation')
        expect(fixture.requirements.imageCounts).toEqual([0, 2, 3]);
    }
  });
});
