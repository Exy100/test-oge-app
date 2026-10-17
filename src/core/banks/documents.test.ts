import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import {
  bankTasks,
  documentTasks,
  documentSets,
  getDocumentSet,
} from './index';
import { createDocumentDataset } from './document-dataset';
import { documentMaterial, makeTextDocument } from './text-document';
import { createTaskDataset } from '../generators/task-dataset';
import { TaskInstanceSchema } from '../schemas';
import { validateOdf } from '../datasets/odf';
import { verifyArchive } from '../datasets';
const decoder = new TextDecoder();

test('twelve original documents complement presentations with valid separate artifact identities', () => {
  expect(documentTasks).toHaveLength(12);
  expect(bankTasks).toHaveLength(24);
  expect(new Set(bankTasks.map((task) => task.datasetId)).size).toBe(24);
  expect(new Set(documentSets.map((set) => set.title)).size).toBe(12);
  for (const task of documentTasks) {
    expect(TaskInstanceSchema.parse(task)).toEqual(task);
    expect(task.answer.type === 'artifact' && task.answer.kind).toBe(
      'document',
    );
    expect(task.variant13).toBe('document');
    expect(task.criteria?.levels.map((level) => level.score)).toEqual([
      0, 1, 2,
    ]);
    expect(task.solution).toHaveLength(3);
    expect(task.hints).toHaveLength(3);
    expect(task.statement).toContain(task.seed);
    expect(task.statement).toContain(
      'Имена, фамилии и контакты вводить не нужно',
    );
  }
  expect(() => getDocumentSet('missing')).toThrow();
});
for (const [index, task] of documentTasks.entries()) {
  test(`${task.seed}: complete editable documents, genuine tables, styles and reproducible archived bytes`, async () => {
    const set = getDocumentSet(task.seed);
    const dataset = await createTaskDataset(task);
    await verifyArchive(dataset.manifest, dataset.archive);
    expect(dataset.manifest.kind).toBe('curated');
    expect(dataset.manifest.generatorVersion).toBe('curated-documents-v2');
    expect(dataset.files.size).toBe(12);
    for (const entry of dataset.manifest.files) {
      const bytes = dataset.files.get(entry.path);
      if (!bytes) throw new Error('Missing file');
      expect(entry.license).toBe('CC0-1.0');
      expect(entry.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(entry.size).toBe(bytes.length);
      if (entry.format === 'odt') validateOdf(bytes, 'odt');
    }
    expect(decoder.decode(dataset.files.get('source/material.txt'))).toBe(
      documentMaterial(set).join('\n') + '\n',
    );
    const reference = dataset.files.get('reference/answer.odt');
    if (!reference) throw new Error('Missing reference');
    const files = validateOdf(reference, 'odt');
    const content = decoder.decode(files.get('content.xml')),
      styles = decoder.decode(files.get('styles.xml'));
    const parsed: unknown = new XMLParser({ ignoreAttributes: false }).parse(
      content,
    );
    expect(parsed).toBeTypeOf('object');
    expect(content.match(/<table:table /gu)).toHaveLength(1);
    expect(content.match(/<table:table-row>/gu)).toHaveLength(
      set.rows.length + 1 + (set.family === 'sections' ? 1 : 0),
    );
    expect(content.match(/<table:covered-table-cell\/>/gu)?.length ?? 0).toBe(
      set.family === 'instructions' ? 0 : set.family === 'sections' ? 2 : 1,
    );
    if (set.family === 'instructions')
      expect(content).toContain(
        `<text:span text:style-name="Bold"><text:span text:style-name="Underline">${set.title}</text:span></text:span>`,
      );
    expect(content).toContain('style:vertical-align="middle"');
    expect(content).toContain('table:align="center"');
    expect(content).toContain('style:width="15cm"');
    expect(styles).toContain('fo:font-size="14pt"');
    expect(styles).not.toContain('fo:font-size="18pt"');
    expect(styles).toContain('fo:text-indent="1cm"');
    expect(styles).toContain('fo:margin-bottom="14pt"');
    expect(styles).toContain('fo:text-align="justify"');
    expect(styles).toContain('fo:font-weight="bold"');
    expect(styles).toContain('fo:font-style="italic"');
    expect(styles).toContain('style:text-underline-style="solid"');
    for (const [score, paragraphCount] of [
      [0, 1],
      [1, 3],
    ] as const) {
      const bytes = dataset.files.get(`examples/score-${String(score)}.odt`);
      if (!bytes) throw new Error('Missing score example');
      const xml = decoder.decode(validateOdf(bytes, 'odt').get('content.xml'));
      expect(xml).not.toContain('<table:table ');
      expect(xml.match(/<text:p text:style-name=/gu)).toHaveLength(
        paragraphCount,
      );
    }
    const pdf = dataset.files.get('layout/sample.pdf');
    expect(decoder.decode(pdf?.slice(0, 5))).toBe('%PDF-');
    const criteria: unknown = JSON.parse(
      decoder.decode(dataset.files.get('criteria.json')),
    );
    expect(criteria).toMatchObject({
      kind: 'educational-self-assessment',
      max: 2,
    });
    expect(criteria).toHaveProperty('checklist.length', 6);
    expect((await createDocumentDataset(task)).archive).toEqual(
      dataset.archive,
    );
    expect(
      await readFile(
        `samples/13-2-files/${String(index + 1).padStart(2, '0')}/dataset.zip`,
      ),
    ).toEqual(Buffer.from(dataset.archive));
  });
}
test.each(['D01', 'D06', 'D12'])(
  'golden document task and manifest %s',
  async (id) => {
    const task = documentTasks.find((item) => item.seed === id);
    if (!task) throw new Error('Missing task');
    expect(task).toMatchSnapshot();
    expect((await createDocumentDataset(task)).manifest).toMatchSnapshot();
  },
);
test('rejects mismatched document identities and invalid table/style geometry', async () => {
  const task = documentTasks[0];
  const set = documentSets[0];
  if (!task || !set) throw new Error('Missing set');
  for (const changed of [
    { ...task, id: 'wrong' },
    { ...task, datasetId: 'wrong' },
    { ...task, generatorId: 'wrong' },
    { ...task, statement: 'wrong' },
    { ...task, taskNumber: 12 as const },
    { ...task, variant13: 'presentation' as const },
    { ...task, answer: { type: 'integer' as const, value: '1' } },
    {
      ...task,
      answer: {
        type: 'artifact' as const,
        kind: 'presentation' as const,
        referenceId: 'wrong',
      },
    },
    {
      ...task,
      answer: {
        type: 'artifact' as const,
        kind: 'document' as const,
        referenceId: 'wrong',
      },
    },
  ])
    await expect(createDocumentDataset(changed)).rejects.toThrow();
  for (const changed of [
    { ...set, rows: [['wrong']] },
    { ...set, headers: [] },
    { ...set, format: { ...set.format, widths: [5, 5, 5] } },
    { ...set, format: { ...set.format, widths: [NaN, 5, 7] } },
    { ...set, format: { ...set.format, headerColor: 'url(external)' } },
    { ...set, title: 'a'.repeat(251) },
    { ...set, paragraphs: ['', set.paragraphs[1]] as const },
  ])
    expect(() => makeTextDocument(changed)).toThrow();
});
