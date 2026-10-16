import { expect, test } from 'vitest';
import { makeHtm, readHtm } from './htm';
import { makeTiff, readTiff } from './tiff';
import { makePdf, readPdf } from './pdf';
import { originalJpeg, validateOriginalJpeg } from './jpeg';
import { createDataset, verifyDataset } from './index';
const encoder = new TextEncoder();

test('HTM preserves passive text, entities and paragraph boundaries', () => {
  const document = {
    title: 'Карта & берег',
    blocks: [
      { tag: 'h1' as const, text: 'Рассказ' },
      { tag: 'p' as const, text: '«Лист <карты> & "компас"», — сказал герой.' },
    ],
  };
  expect(readHtm(makeHtm(document))).toEqual(document);
  for (const replacement of [
    '<script>alert(1)</script>',
    '<p onclick="x()">текст</p>',
    '<iframe src="https://example.com"></iframe>',
    '<p>&unknown;</p>',
    '<p>незакрытый',
  ]) {
    const text = new TextDecoder()
      .decode(makeHtm(document))
      .replace('<h1>Рассказ</h1>', replacement);
    expect(() => readHtm(encoder.encode(text))).toThrow();
  }
  expect(() => readHtm(new Uint8Array([255]))).toThrow();
  expect(() => makeHtm({ title: ' ', blocks: document.blocks })).toThrow();
  expect(() => makeHtm({ title: 'Текст', blocks: [] })).toThrow();
  expect(() =>
    makeHtm({ title: 'Текст', blocks: [{ tag: 'p', text: 'Ноль\0' }] }),
  ).toThrow();
  expect(() => readHtm(new Uint8Array(1_048_577))).toThrow();
});
test('TIFF contains actual grayscale pixels and rejects malformed IFDs, strips and dimensions', () => {
  const pixels = Uint8Array.from([0, 50, 100, 150, 200, 255]),
    bytes = makeTiff(3, 2, pixels);
  expect(readTiff(bytes)).toEqual({ width: 3, height: 2, pixels });
  for (const offset of [
    0, 2, 4, 8, 10, 12, 14, 18, 30, 78, 126, 154, 158, 162,
  ]) {
    const broken = bytes.slice();
    broken[offset] = (broken[offset] ?? 0) ^ 1;
    expect(() => readTiff(broken)).toThrow();
  }
  expect(() => readTiff(bytes.subarray(0, -1))).toThrow();
  expect(() => makeTiff(0, 2, pixels)).toThrow();
  expect(() => makeTiff(513, 2, pixels)).toThrow();
  expect(() => makeTiff(1.5, 4, pixels)).toThrow();
});
test('PDF has exact xref offsets, escaped literals and a bounded passive page', () => {
  const lines = ['River notes', 'Compass (north) \\ scale', 'CC0-1.0'];
  const bytes = makePdf(lines);
  expect(readPdf(bytes)).toEqual(lines);
  for (const text of [
    new TextDecoder().decode(bytes).replace('/Type /Page ', '/Type /Form '),
    new TextDecoder().decode(bytes).replace('startxref\n', 'startxref\n1'),
    '%PDF-1.4\n/JavaScript /Launch',
  ])
    expect(() => readPdf(encoder.encode(text))).toThrow();
  expect(() => makePdf([])).toThrow();
  expect(() => makePdf(['Строка вне ASCII'])).toThrow();
  expect(() => readPdf(new Uint8Array(10001))).toThrow();
  expect(() => readPdf(new Uint8Array([255]))).toThrow();
});
test('JPEG accepts only the original illustrations and never exposes cached bytes', () => {
  for (let i = 0; i < 8; i++) {
    const bytes = originalJpeg(i);
    expect(() => {
      validateOriginalJpeg(bytes);
    }).not.toThrow();
    const changed = bytes.slice();
    const middle = Math.floor(changed.length / 2);
    changed[middle] = (changed[middle] ?? 0) ^ 1;
    expect(() => {
      validateOriginalJpeg(changed);
    }).toThrow();
    bytes[0] = 0;
    expect(originalJpeg(i)[0]).toBe(255);
  }
  expect(() => originalJpeg(-1)).toThrow();
  expect(() => originalJpeg(8)).toThrow();
});
test('dataset validation checks actual new formats as well as the SHA-256 manifest', async () => {
  const sources = [
    {
      path: 'текст.htm',
      format: 'htm' as const,
      bytes: makeHtm({
        title: 'Текст',
        blocks: [{ tag: 'p', text: 'История.' }],
      }),
      license: 'CC0-1.0',
    },
    {
      path: 'рисунок.tiff',
      format: 'tiff' as const,
      bytes: makeTiff(2, 2, new Uint8Array([0, 100, 180, 255])),
      license: 'CC0-1.0',
    },
    {
      path: 'иллюстрация.jpeg',
      format: 'jpeg' as const,
      bytes: originalJpeg(0),
      license: 'CC0-1.0',
    },
    {
      path: 'лист.pdf',
      format: 'pdf' as const,
      bytes: makePdf(['Notes. CC0-1.0']),
      license: 'CC0-1.0',
    },
  ];
  const dataset = await createDataset(
    'reading-formats',
    'example',
    'reading-formats-v2',
    sources,
  );
  expect(await verifyDataset(dataset.manifest, dataset.files)).toEqual(
    dataset.manifest,
  );
  for (const source of sources)
    await expect(
      createDataset('bad', 'seed', 'bad', [
        { ...source, bytes: encoder.encode('wrong format') },
      ]),
    ).rejects.toThrow();
});
