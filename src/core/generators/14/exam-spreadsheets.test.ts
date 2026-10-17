import { readFile } from 'node:fs/promises';
import { expect, test, describe } from 'vitest';
import fc from 'fast-check';
import {
  spreadsheetGenerators,
  sheetData,
  sheetKinds,
  sheetAnswers,
  type SheetData,
} from './exam-spreadsheets';
import { createTaskDataset } from '../task-dataset';
import { checkGeneratorSeed } from '../quality';
import { verifyArchive } from '../../datasets';
import { packZip, readZip, limits } from '../../datasets/zip';
import { validateOdf, makeOdf } from '../../datasets/odf';
import { pieChart, spreadsheetFile } from './dataset';
const decoder = new TextDecoder();
/** Solve from exported CSV: group records, sort extrema, and derive each query independently. */
function oracle(csv: string, d: SheetData) {
  const rows = csv
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(';'));
  if (d.kind === 'sheet-count-range') {
    const selected = rows.filter((r) => r[1] === d.sex),
      sorted = rows.map((r) => Number(r[4])).sort((a, b) => a - b);
    return {
      values: [
        selected.filter((r) => r[2] === d.group).length,
        (sorted.at(-1) ?? 0) - (sorted[0] ?? 0),
      ],
      chart: ['пенсионер', 'студент', 'служащий'].map(
        (s) => selected.filter((r) => r[2] === s).length,
      ),
    };
  }
  const grouped = new Map<string, string[][]>();
  for (const row of rows) {
    const key = row[1] ?? '';
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  const selected = grouped.get(d.group) ?? [];
  let total = 0;
  for (const row of selected)
    total += Number(row[d.kind === 'sheet-sum-mean' ? 5 : 3]);
  const factor = d.kind === 'sheet-sum-mean' ? 10 : 100;
  const mean = Math.round((total / selected.length) * factor) / factor;
  if (d.kind === 'sheet-sum-mean')
    return {
      values: [
        rows
          .filter((r) =>
            Array.from(
              { length: 3 },
              (_, i) => `${String(d.startDay + i)} октября`,
            ).includes(r[0] ?? ''),
          )
          .reduce((a, r) => a + Number(r[3]), 0),
        mean,
      ],
      chart: ['1 октября', '2 октября', '3 октября'].map(
        (day) => rows.filter((r) => r[0] === day).length,
      ),
    };
  return {
    values: [
      rows.filter((r) => Number(r[2]) === d.grade && Number(r[3]) > d.threshold)
        .length,
      mean,
    ],
    chart: [7, 8, 9].map(
      (grade) => rows.filter((r) => Number(r[2]) === grade).length,
    ),
  };
}
const seeds =
  fc.sample(fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }), {
    seed: 20261017,
    numRuns: 1,
  })[0] ?? [];
for (const g of spreadsheetGenerators)
  describe(g.id, () => {
    test.each(Array.from({ length: 10 }, (_, i) => i))(
      '500-seed campaign, batch %i',
      async (batch) => {
        expect(new Set(seeds).size).toBe(500);
        for (const seed of seeds.slice(batch * 50, (batch + 1) * 50)) {
          const task = g.generate(seed),
            dataset = await createTaskDataset(task),
            d = sheetData(g.subtype as (typeof sheetKinds)[number], seed);
          const result = oracle(
            decoder.decode(dataset.files.get('source/data.csv')),
            d,
          );
          expect(result).toEqual({
            values: sheetAnswers(d).values,
            chart: sheetAnswers(d).chart,
          });
          expect(dataset.archive.length).toBeLessThan(limits.file);
          const reference = dataset.files.get('reference/answer.ods');
          if (!reference) throw new Error('Missing ODS');
          const files = readZip(reference),
            content = decoder.decode(files.get('content.xml'));
          expect(content.match(/table:formula=/gu)).toHaveLength(5);
          expect(content.match(/<draw:object /gu)).toHaveLength(1);
          expect(decoder.decode(files.get('Object1/content.xml'))).toContain(
            'chart:class="chart:circle"',
          );
          checkGeneratorSeed(g, seed, {
            assertFiles: () => [dataset.manifest],
            assertUnique: () => {
              expect(result.values).toEqual(sheetAnswers(d).values);
            },
            assertQuality: (t) => {
              expect(t.criteria?.max).toBe(3);
              expect(t.statement).toContain('круговую диаграмму');
            },
          });
        }
      },
      60000,
    );
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden task, files and manifest %s',
      async (seed) => {
        const task = g.generate(seed),
          d = await createTaskDataset(task);
        await verifyArchive(d.manifest, d.archive);
        expect(task).toMatchSnapshot();
        expect(d.manifest).toMatchSnapshot();
        expect((await createTaskDataset(task)).archive).toEqual(d.archive);
      },
    );
    test('rejects altered instructions, criteria, reference and identity', async () => {
      const task = g.generate('negative');
      for (const change of [
        { id: 'wrong' },
        { generatorId: 'wrong' },
        { datasetId: 'wrong' },
        { statement: 'wrong' },
        { criteria: { max: 2 as const, levels: [] } },
        {
          answer: {
            type: 'artifact' as const,
            kind: 'spreadsheet' as const,
            referenceId: 'wrong',
          },
        },
        { solution: [{ text: 'wrong' }] },
      ]) {
        const changed = { ...task, ...change };
        expect(g.verify(changed)).toBe(false);
        await expect(createTaskDataset(changed)).rejects.toThrow();
      }
    });
  });
test.each(Array.from({ length: 12 }, (_, i) => i))(
  'committed exam sample %i reproduces and contains only two numerical answers',
  async (i) => {
    const g = spreadsheetGenerators[i % 3];
    if (!g) throw new Error('Missing generator');
    const d = await createTaskDataset(g.generate(`review:${String(i)}`));
    expect(
      await readFile(
        `samples/14-files/${String(i + 1).padStart(2, '0')}/dataset.zip`,
      ),
    ).toEqual(Buffer.from(d.archive));
  },
);
test.each(
  sheetKinds.flatMap((kind) =>
    ([0, 1, 2, 3] as const).map((score) => [kind, score] as const),
  ),
)(
  '%s score %i: file bytes and declared independent elements agree',
  async (kind, score) => {
    const d = sheetData(kind, 'scoring-examples');
    const bytes = await readFile(
      `samples/office-scores/14/${kind}/score-${String(score)}.ods`,
    );
    expect(
      Buffer.compare(bytes, Buffer.from(spreadsheetFile(d, true, score))),
    ).toBe(0);
    const files = validateOdf(bytes, 'ods');
    expect(files.has('Object1/content.xml')).toBe(score === 3);
    const xml = decoder.decode(files.get('content.xml'));
    expect(xml.match(/table:formula=/gu)).toHaveLength(3 + Math.min(score, 2));
  },
);
test('chart profile rejects external resources, undeclared objects and altered manifests', () => {
  const d = sheetData('sheet-count-mean', 'negative'),
    original = readZip(spreadsheetFile(d, true));
  for (const href of [
    'https://example.test/chart',
    '../Object1',
    './Object2',
  ]) {
    const files = new Map(original);
    files.set(
      'content.xml',
      new TextEncoder().encode(
        decoder.decode(files.get('content.xml')).replace('./Object1', href),
      ),
    );
    expect(() => validateOdf(packZip(files, 'mimetype'), 'ods')).toThrow();
  }
  for (const [path, from, to] of [
    ['Object1/content.xml', 'chart:circle', 'chart:bar'],
    [
      'META-INF/manifest.xml',
      'application/vnd.oasis.opendocument.chart',
      'application/octet-stream',
    ],
    ['Object1/content.xml', '<office:body>', '<office:body><office:scripts/>'],
  ] as const) {
    const files = new Map(original);
    files.set(
      path,
      new TextEncoder().encode(
        decoder.decode(files.get(path)).replace(from, to),
      ),
    );
    expect(() => validateOdf(packZip(files, 'mimetype'), 'ods')).toThrow();
  }
  const extra = new Map(original);
  extra.set('Object2/content.xml', new Uint8Array());
  expect(() => validateOdf(packZip(extra, 'mimetype'), 'ods')).toThrow();
  expect(() =>
    makeOdf('odt', '<office:text/>', {
      chart: pieChart(['a', 'b', 'c'], [1, 2, 3]),
    }),
  ).toThrow();
  for (const values of [
    [0, 0, 0],
    [-1, 2, 3],
    [1, 2],
    [NaN, 1, 2],
  ])
    expect(() => pieChart(['a', 'b', 'c'], values)).toThrow();
  expect(() => sheetAnswers({ ...d, rows: [] })).toThrow();
});
