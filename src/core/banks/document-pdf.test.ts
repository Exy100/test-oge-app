import { expect, test } from 'vitest';
import { documentPdf, validateDocumentPdf } from './document-pdf';
import { createCuratedDataset } from '../datasets';
test('only the twelve exact authored PDFs are accepted; no arbitrary PDF profile is enabled', async () => {
  for (let i = 1; i <= 12; i++)
    expect(() => {
      validateDocumentPdf(documentPdf(`D${String(i).padStart(2, '0')}`));
    }).not.toThrow();
  expect(() => documentPdf('unknown')).toThrow();
  const changed = documentPdf('D01');
  changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
  expect(() => {
    validateDocumentPdf(changed);
  }).toThrow();
  await expect(
    createCuratedDataset('changed-pdf', 'seed', 'author', [
      { path: 'sample.pdf', format: 'pdf', bytes: changed, license: 'CC0-1.0' },
    ]),
  ).rejects.toThrow();
});
