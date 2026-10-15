import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test, describe } from 'vitest';
import fc from 'fast-check';
import { SyntaxValidator } from 'fast-xml-validator';
import { generatorsForTask } from './index';
import { createTaskDataset } from './task-dataset';
import { checkGeneratorSeed } from './quality';
import { readZip } from '../datasets/zip';
import { verifyArchive } from '../datasets';
import { formulaSpreadsheet } from './14/dataset';
import { sheetAnswers, type SheetData } from './14/spreadsheets';
const decoder = new TextDecoder();
function sourceRows(bytes: Uint8Array): string[][] {
  const xml = decoder.decode(readZip(bytes).get('content.xml'));
  return [...xml.matchAll(/<table:table-row>(.*?)<\/table:table-row>/gu)].map(
    (row) =>
      [
        ...(row[1] ?? '').matchAll(
          /<table:table-cell[^>]*>(.*?)<\/table:table-cell>/gu,
        ),
      ].map((cell) =>
        (cell[1] ?? '').replace(/<text:s\/>/gu, ' ').replace(/<[^>]*>/gu, ''),
      ),
  );
}
for (const generator of generatorsForTask(14))
  describe(generator.id, () => {
    test.each([0, 1, 2, 3])(
      '500-seed campaign, batch %i: schema, ODS, independent queries, formulas, manifests and determinism',
      async (batch) => {
        const seeds =
          fc.sample(
            fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
            { seed: 20261015, numRuns: 1 },
          )[0] ?? [];
        expect(seeds).toHaveLength(500);
        expect(new Set(seeds).size).toBe(500);
        for (const seed of seeds.slice(batch * 125, (batch + 1) * 125)) {
          const task = generator.generate(seed),
            dataset = await createTaskDataset(task);
          const bytes = dataset.files.get('source/data.ods');
          if (!bytes) throw new Error('Missing source');
          const rows = sourceRows(bytes);
          expect(rows).toHaveLength(241);
          const referenceBytes = dataset.files.get('reference/answer.ods');
          if (!referenceBytes) throw new Error('Missing reference');
          const ref = decoder.decode(
            readZip(referenceBytes).get('content.xml'),
          );
          expect(ref.match(/table:formula=/gu)).toHaveLength(243);
          expect(ref).toContain('[.E2:.E241]');
          expect(ref).not.toContain('[.E1:');
          const meta = JSON.parse(
            decoder.decode(dataset.files.get('reference/answers.json')),
          ) as { group: string; threshold: number; answers: number[] };
          const selected = rows
            .slice(1)
            .filter(
              (row) =>
                row[1] === meta.group &&
                (task.subtype !== 'sheet-filter' ||
                  Number(row[2]) >= meta.threshold) &&
                (task.subtype !== 'sheet-growth' ||
                  Number(row[3]) > Number(row[2])),
            );
          const values = selected.map((row) =>
            task.subtype === 'sheet-revenue'
              ? Number(row[2]) * Number(row[3])
              : task.subtype === 'sheet-group'
                ? Number(row[2]) + Number(row[3])
                : task.subtype === 'sheet-growth'
                  ? Number(row[3]) - Number(row[2])
                  : Number(row[3]),
          );
          let sum = 0;
          for (const value of values) sum += value;
          const expected = [
            values.length,
            task.subtype === 'sheet-group'
              ? Math.round((sum * 100) / values.length) / 100
              : sum,
            [...values].sort((a, b) => b - a)[0],
          ];
          checkGeneratorSeed(generator, seed, {
            assertFiles() {
              for (const entry of dataset.manifest.files) {
                const bytes = dataset.files.get(entry.path);
                if (!bytes) throw new Error('Missing file');
                expect(entry.sha256).toBe(
                  createHash('sha256').update(bytes).digest('hex'),
                );
              }
              return [dataset.manifest];
            },
            assertUnique() {
              expect(meta.answers).toEqual(expected);
              expect(new Set(rows.slice(1).map((row) => row[0])).size).toBe(
                240,
              );
            },
            assertQuality(task) {
              expect(task.answer.type === 'artifact' && task.answer.kind).toBe(
                'spreadsheet',
              );
              expect(task.criteria?.max).toBe(3);
              expect(task.criteria?.levels.map((level) => level.score)).toEqual(
                [0, 1, 2, 3],
              );
            },
          });
        }
      },
      60000,
    );
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden task, files and manifest %s',
      async (seed) => {
        const task = generator.generate(seed),
          dataset = await createTaskDataset(task);
        await verifyArchive(dataset.manifest, dataset.archive);
        for (const entry of dataset.manifest.files) {
          if (entry.format !== 'ods') continue;
          const bytes = dataset.files.get(entry.path);
          if (!bytes) throw new Error('Missing ODS');
          for (const [name, xml] of readZip(bytes)) {
            if (name.endsWith('.xml'))
              expect(() =>
                SyntaxValidator.validate(decoder.decode(xml), {
                  invalidCharSequence: {
                    comment: true,
                    tagValue: true,
                    attrLt: true,
                  },
                }),
              ).not.toThrow();
          }
        }
        expect(task).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
        expect((await createTaskDataset(task)).archive).toEqual(
          dataset.archive,
        );
      },
    );
    test('rejects changed requests, references, score ceilings and data identity', async () => {
      const task = generator.generate('negative');
      for (const changed of [
        { ...task, statement: task.statement + ' Changed' },
        { ...task, datasetId: 'wrong' },
        { ...task, id: 'wrong' },
        { ...task, examPart: 1 as const },
        { ...task, variant13: 'document' as const },
        { ...task, taskNumber: 12 as const },
        { ...task, answer: { type: 'integer' as const, value: '1' } },
        { ...task, criteria: { max: 2 as const, levels: [] } },
        { ...task, solution: [{ text: 'wrong' }, ...task.solution.slice(1)] },
      ]) {
        expect(generator.verify(changed)).toBe(false);
        await expect(createTaskDataset(changed)).rejects.toThrow();
      }
    });
  });
test.each(Array.from({ length: 12 }, (_, index) => index))(
  'committed sample %i reproduces exactly',
  async (i) => {
    const generators = generatorsForTask(14);
    const generator = generators[i % 4];
    if (!generator) throw new Error('Missing generator');
    const dataset = await createTaskDataset(
      generator.generate(`review:${String(i)}`),
    );
    expect(
      await readFile(
        `samples/14-files/${String(i + 1).padStart(2, '0')}/dataset.zip`,
      ),
    ).toEqual(Buffer.from(dataset.archive));
  },
);
test('empty selection, invalid numbers and nonformula cells fail explicitly', () => {
  const empty: SheetData = {
    headers: [],
    rows: [],
    group: 'Альфа',
    threshold: 8,
  };
  expect(() => sheetAnswers('sheet-filter', empty)).toThrow();
  expect(() => formulaSpreadsheet([[NaN]])).toThrow();
  expect(() =>
    formulaSpreadsheet([[{ formula: 'external', value: 1 }]]),
  ).toThrow();
});

test('inclusive class bounds and strictly positive growth are distinct; averages round half up', () => {
  const data: SheetData = {
    headers: [],
    group: 'Альфа',
    threshold: 8,
    rows: [
      [1, 'Альфа', 8, 10],
      [2, 'Альфа', 7, 10],
      [3, 'Бета', 9, 20],
    ],
  };
  expect(sheetAnswers('sheet-filter', data)).toEqual([1, 10, 10]);
  expect(
    sheetAnswers('sheet-growth', {
      ...data,
      rows: [
        [1, 'Альфа', 50, 50],
        [2, 'Альфа', 50, 51],
        [3, 'Альфа', 50, 49],
        [4, 'Бета', 10, 90],
      ],
    }),
  ).toEqual([1, 1, 1]);
  expect(
    sheetAnswers('sheet-group', {
      ...data,
      rows: Array.from(
        { length: 200 },
        (_, index) => [index + 1, 'Альфа', 0, index === 0 ? 2 : 1] as const,
      ),
    }),
  ).toEqual([200, 1.01, 2]);
});
