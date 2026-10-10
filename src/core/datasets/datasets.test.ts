import { describe, expect, test } from 'vitest';
import { zipSync } from 'fflate';
import {
  createDataset,
  createExampleDataset,
  sha256,
  verifyArchive,
  verifyDataset,
} from './index';
import {
  makeDocument,
  makePresentation,
  makeSpreadsheet,
  validateOdf,
  xml,
} from './odf';
import {
  crc32,
  limits,
  packZip,
  readZip,
  safePath,
  validateFiles,
} from './zip';

const enc = new TextEncoder();
const dec = new TextDecoder();
const text = enc.encode('Привет, мир!');
const files = () =>
  new Map([
    ['texts/пример.txt', text],
    ['a.txt', enc.encode('abc')],
  ]);

describe('bounded deterministic ZIP', () => {
  test('round trip, stable ordering, CRC reference and content ownership', async () => {
    const archive = packZip(files());
    expect(packZip(new Map([...files()].reverse()))).toEqual(archive);
    expect(readZip(archive)).toEqual(new Map([...files()].sort()));
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    await expect(sha256(enc.encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const extracted = readZip(archive);
    extracted.get('a.txt')?.fill(0);
    expect(dec.decode(readZip(archive).get('a.txt'))).toBe('abc');
  });
  test.each([
    '../a.txt',
    '/a.txt',
    'a/../b.txt',
    'a\\b.txt',
    'C:/a.txt',
    'https://host/a',
    'a%2fb',
    'a//b',
    'a/./b',
    'a\0b',
    'a\nb',
    'a.',
    'CON.txt',
    'aux/a.txt',
    'a?',
    'a*',
    'a|b',
    'e\u0301.txt',
    'a'.repeat(241),
  ])('rejects path %j', (path) => {
    expect(() => safePath(path)).toThrow();
    expect(() => packZip(new Map([[path, text]]))).toThrow();
    expect(() => readZip(zipSync({ [path]: text }, { level: 0 }))).toThrow();
  });
  test('duplicate case, file/directory conflict, count and size limits', () => {
    expect(() =>
      packZip(
        new Map([
          ['a', text],
          ['A', text],
        ]),
      ),
    ).toThrow('Повтор');
    expect(() =>
      packZip(
        new Map([
          ['a', text],
          ['a/b', text],
        ]),
      ),
    ).toThrow('каталогом');
    expect(() => packZip(new Map())).toThrow();
    expect(() =>
      packZip(
        new Map(Array.from({ length: 101 }, (_, i) => [String(i), text])),
      ),
    ).toThrow();
    expect(() =>
      packZip(new Map([['a', new Uint8Array(limits.file + 1)]])),
    ).toThrow();
    expect(() => {
      validateFiles(
        new Map(
          Array.from({ length: 9 }, (_, i) => [
            String(i),
            new Uint8Array(limits.file),
          ]),
        ),
      );
    }).toThrow('общий размер');
    expect(() => readZip(new Uint8Array(limits.archive + 1))).toThrow();
  });
  test('corruption, compression, truncation, duplicate names and oversized declarations', () => {
    const archive = packZip(
      new Map([
        ['a', text],
        ['b', text],
      ]),
    );
    const corrupted = archive.slice();
    corrupted[31] = (corrupted[31] ?? 0) ^ 1;
    expect(() => readZip(corrupted)).toThrow('CRC');
    expect(() => readZip(archive.subarray(0, archive.length - 1))).toThrow();
    expect(() => readZip(zipSync({ a: text }, { level: 9 }))).toThrow(
      'профиль',
    );
    const forged = archive.slice();
    const view = new DataView(forged.buffer);
    const central = view.getUint32(forged.length - 6, true);
    view.setUint32(central + 24, limits.file + 1, true);
    expect(() => readZip(forged)).toThrow();
    const duplicate = archive.slice();
    const dv = new DataView(duplicate.buffer);
    const second = central + 47;
    const offset = dv.getUint32(second + 42, true);
    duplicate[second + 46] = 97;
    duplicate[offset + 30] = 97;
    expect(() => readZip(duplicate)).toThrow('уникальность');
  });
});

describe('real ODF', () => {
  test.each(['odt', 'odp', 'ods'] as const)(
    'correct package structure for %s',
    (kind) => {
      const formats = {
        odt: makeDocument(['<>&"', '  текст\nстрока\tтаб']),
        odp: makePresentation([{ title: 'Заголовок', paragraphs: ['Текст'] }]),
        ods: makeSpreadsheet([
          ['Товар', 'Цена'],
          ['Книга', 123.5],
          ['=SUM(A1)', 0],
        ]),
      };
      const bytes = formats[kind];
      const entries = validateOdf(bytes, kind);
      expect([...entries.keys()][0]).toBe('mimetype');
      expect(entries.size).toBe(4);
      expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
      expect(new DataView(bytes.buffer).getUint16(28, true)).toBe(0);
      const content = dec.decode(entries.get('content.xml'));
      if (kind === 'odt') expect(content).toContain('&lt;&gt;&amp;&quot;');
      if (kind === 'ods') {
        expect(content).toContain(
          'office:value-type="float" office:value="123.5"',
        );
        expect(content).toContain('office:value-type="string"');
        expect(content).not.toContain('table:formula');
      }
      expect(() =>
        validateOdf(bytes, kind === 'ods' ? 'odt' : 'ods'),
      ).toThrow();
    },
  );
  test('rejects extension spoofing, DTD, malformed XML and manifest mismatch', () => {
    expect(() => validateOdf(enc.encode('a,b\n1,2'), 'ods')).toThrow();
    const entries = readZip(makeDocument(['Текст']));
    for (const content of [
      '<broken>',
      '<!DOCTYPE x [<!ENTITY x "data">]><x/>',
    ]) {
      const bad = new Map(entries);
      bad.set('content.xml', enc.encode(content));
      expect(() => validateOdf(packZip(bad, 'mimetype'), 'odt')).toThrow();
    }
    const mismatch = new Map(entries);
    mismatch.set(
      'META-INF/manifest.xml',
      enc.encode(
        dec
          .decode(entries.get('META-INF/manifest.xml'))
          .replace('content.xml', 'wrong.xml'),
      ),
    );
    expect(() => validateOdf(packZip(mismatch, 'mimetype'), 'odt')).toThrow(
      'Манифест',
    );
    expect(() => validateOdf(packZip(entries), 'odt')).toThrow('состав');
  });
  test('rejects invalid XML characters, dimensions and numeric values', () => {
    for (const value of ['\0', '\ud800', '\uffff'])
      expect(() => xml(value)).toThrow();
    expect(xml('😀')).toBe('😀');
    expect(() => makeDocument([])).toThrow();
    expect(() => makePresentation([])).toThrow();
    expect(() => makeSpreadsheet([[1], [1, 2]])).toThrow();
    for (const value of [NaN, Infinity, -0, 1e13])
      expect(() => makeSpreadsheet([[value]])).toThrow();
  });
});

test('dataset bytes and manifests are deterministic on 20 seeds and reflect actual data', async () => {
  const hashes = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const seed = `dataset:${String(index)}`;
    const first = await createExampleDataset(seed);
    const second = await createExampleDataset(seed);
    expect(second.manifest).toEqual(first.manifest);
    expect(second.archive).toEqual(first.archive);
    await expect(verifyArchive(first.manifest, first.archive)).resolves.toEqual(
      first.manifest,
    );
    hashes.add(await sha256(first.archive));
    const reference = JSON.parse(
      dec.decode(first.files.get('reference/ответ.json')),
    ) as { prices: number[]; total: number };
    const csv = dec
      .decode(first.files.get('tables/цены.csv'))
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => Number(line.split(';')[1]));
    expect(csv).toEqual(reference.prices);
    expect(csv.reduce((sum, value) => sum + value, 0)).toBe(reference.total);
  }
  expect(hashes.size).toBe(20);
}, 30000);

test('manifest mismatch, hashes, extra files, extensions and duplicate paths fail', async () => {
  const dataset = await createExampleDataset('negative');
  const altered = new Map(dataset.files);
  altered.set('tables/цены.csv', text);
  await expect(verifyDataset(dataset.manifest, altered)).rejects.toThrow(
    'Размер или SHA',
  );
  const extra = new Map(dataset.files);
  extra.set('extra.txt', text);
  await expect(verifyDataset(dataset.manifest, extra)).rejects.toThrow(
    'Состав',
  );
  const source = {
    path: 'a.txt',
    format: 'txt' as const,
    bytes: text,
    license: 'CC0-1.0',
  };
  await expect(
    createDataset('id', 'seed', 'gen', [source, source]),
  ).rejects.toThrow('Повтор');
  await expect(
    createDataset('id', 'seed', 'gen', [{ ...source, format: 'ods' }]),
  ).rejects.toThrow();
  await expect(
    createDataset('id', 'seed', 'gen', [
      { ...source, path: 'a.ods', format: 'ods' },
    ]),
  ).rejects.toThrow();
  const hashMismatch = structuredClone(dataset.manifest);
  const entry = hashMismatch.files[0];
  if (!entry) throw new Error('Нет файлов.');
  entry.sha256 = '0'.repeat(64);
  await expect(verifyDataset(hashMismatch, dataset.files)).rejects.toThrow(
    'SHA',
  );
});
