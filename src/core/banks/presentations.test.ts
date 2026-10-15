import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { bankTasks, presentationSets, getPresentationSet } from './index';
import { createPresentationDataset } from './presentation-dataset';
import { createTaskDataset } from '../generators/task-dataset';
import { TaskInstanceSchema } from '../schemas';
import { verifyArchive } from '../datasets';
import { readZip, packZip } from '../datasets/zip';
import { validateOdf } from '../datasets/odf';
import { readPng } from '../datasets/png';
import { deckFor, makeSlideDeck } from './slide-deck';
import { illustrate } from './illustrations';

const decoder = new TextDecoder();
test('twelve unique original sets have valid artifact tasks and complete learning criteria', () => {
  expect(bankTasks).toHaveLength(12);
  expect(new Set(bankTasks.map((task) => task.datasetId)).size).toBe(12);
  expect(new Set(presentationSets.map((set) => set.title)).size).toBe(12);
  expect(new Set(presentationSets.map((set) => set.scene)).size).toBe(12);
  for (const task of bankTasks) {
    expect(TaskInstanceSchema.parse(task)).toEqual(task);
    expect(task.variant13).toBe('presentation');
    expect(task.criteria?.levels.map((level) => level.score)).toEqual([
      0, 1, 2,
    ]);
    expect(task.statement).toContain(task.seed);
    expect(task.statement).toContain(
      'Имена, фамилии и контакты вводить не нужно',
    );
    expect(task.solution).toHaveLength(3);
  }
  expect(() => getPresentationSet('unknown')).toThrow();
});
for (const [index, task] of bankTasks.entries())
  describe(task.seed, () => {
    test('all original files, hashes, editable ODF, images, layout and archived sample agree', async () => {
      const dataset = await createTaskDataset(task);
      expect(dataset.manifest.kind).toBe('curated');
      expect(dataset.manifest.id).toBe(task.datasetId);
      await verifyArchive(dataset.manifest, dataset.archive);
      const unpacked = readZip(dataset.archive);
      for (const entry of dataset.manifest.files) {
        const bytes = unpacked.get(entry.path);
        if (!bytes) throw new Error('Missing file');
        expect(entry.license).toBe('CC0-1.0');
        expect(bytes.length).toBe(entry.size);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          entry.sha256,
        );
        if (entry.format === 'png') {
          const image = readPng(bytes);
          expect(image.width).toBe(480);
          expect(image.height).toBe(
            entry.path.startsWith('layout/') ? 270 : 320,
          );
          expect(new Set(image.pixels).size).toBeGreaterThan(5);
        }
      }
      const source = unpacked.get('source/material.odt');
      const reference = unpacked.get('reference/answer.odp');
      if (!source || !reference) throw new Error('Missing office files');
      validateOdf(source, 'odt');
      const contents = validateOdf(reference, 'odp');
      const content = decoder.decode(contents.get('content.xml'));
      expect(content.match(/<draw:page /gu)).toHaveLength(3);
      expect(content.match(/<draw:image /gu)).toHaveLength(4);
      expect(content).toContain('fo:font-size="32pt"');
      expect(content).toContain('fo:font-size="20pt"');
      for (let i = 1; i <= 3; i++)
        expect(
          Buffer.compare(
            Buffer.from(contents.get(`Pictures/image-${String(i)}.png`) ?? []),
            Buffer.from(unpacked.get(`images/image-${String(i)}.png`) ?? []),
          ),
        ).toBe(0);
      const criteria = JSON.parse(
        decoder.decode(unpacked.get('criteria.json')),
      ) as { checklist: string[]; max: number; kind: string };
      expect(criteria.checklist).toHaveLength(6);
      expect(criteria.kind).toBe('educational-self-assessment');
      expect(criteria.max).toBe(2);
      const deck = deckFor(getPresentationSet(task.seed));
      for (const slide of deck)
        for (const [i, frame] of slide.frames.entries())
          for (const other of slide.frames.slice(i + 1)) {
            const overlaps =
              frame.x < other.x + other.width &&
              frame.x + frame.width > other.x &&
              frame.y < other.y + other.height &&
              frame.y + frame.height > other.y;
            expect(overlaps).toBe(false);
          }
      const again = await createPresentationDataset(task);
      expect(again.manifest).toEqual(dataset.manifest);
      expect(
        Buffer.compare(
          Buffer.from(again.archive),
          Buffer.from(dataset.archive),
        ),
      ).toBe(0);
      const saved = await readFile(
        `samples/13-1-files/${String(index + 1).padStart(2, '0')}/dataset.zip`,
      );
      expect(Buffer.compare(saved, Buffer.from(dataset.archive))).toBe(0);
    });
  });
test.each(['P01', 'P06', 'P12'])('golden task and manifest %s', async (id) => {
  const task = bankTasks.find((item) => item.seed === id);
  if (!task) throw new Error('Missing task');
  expect(task).toMatchSnapshot();
  expect((await createPresentationDataset(task)).manifest).toMatchSnapshot();
});
test('rejects external links, altered image bytes and undeclared ODF resources', async () => {
  const task = bankTasks[0];
  if (!task) throw new Error('Missing task');
  const dataset = await createPresentationDataset(task);
  const reference = dataset.files.get('reference/answer.odp');
  if (!reference) throw new Error('Missing reference');
  const original = readZip(reference);
  const content = decoder.decode(original.get('content.xml'));
  for (const href of [
    'https://example.test/a.png',
    '../images/image-1.png',
    'Pictures/missing.png',
  ]) {
    const files = new Map(original);
    files.set(
      'content.xml',
      new TextEncoder().encode(content.replace('Pictures/image-1.png', href)),
    );
    expect(() => validateOdf(packZip(files, 'mimetype'), 'odp')).toThrow();
  }
  const broken = new Map(original);
  broken.set('Pictures/image-1.png', new Uint8Array(64));
  expect(() => validateOdf(packZip(broken, 'mimetype'), 'odp')).toThrow();
  const extra = new Map(original);
  extra.set('Pictures/unlisted.png', illustrate('tree', 0));
  expect(() => validateOdf(packZip(extra, 'mimetype'), 'odp')).toThrow();
  await expect(
    createPresentationDataset({ ...task, datasetId: 'other' }),
  ).rejects.toThrow();
  await expect(
    createPresentationDataset({ ...task, statement: 'changed' }),
  ).rejects.toThrow();
  const deck = deckFor(getPresentationSet('P01'));
  expect(() => makeSlideDeck([], new Map())).toThrow();
  expect(() => makeSlideDeck(deck, new Map())).toThrow();
  const invalid = deck.map((slide) => ({
    ...slide,
    frames: slide.frames.map((frame) => ({ ...frame, x: 100 })),
  }));
  expect(() => makeSlideDeck(invalid, new Map())).toThrow();
});
