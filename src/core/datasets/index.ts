import { DatasetManifestSchema } from '../schemas';
import type { DatasetFile, DatasetManifest } from '../types';
import { Rng } from '../rng';
import {
  makeDocument,
  makePresentation,
  makeSpreadsheet,
  validateOdf,
} from './odf';
import { packZip, readZip, validateFiles, limits, type Files } from './zip';

const encoder = new TextEncoder();
export const DATASET_VERSION = 'educational-files-v1';
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export interface SourceFile {
  path: string;
  format: DatasetFile['format'];
  bytes: Uint8Array;
  license: string;
}
export interface Dataset {
  manifest: DatasetManifest;
  files: Files;
  archive: Uint8Array;
}
export async function createDataset(
  id: string,
  seed: string,
  generatorId: string,
  sources: readonly SourceFile[],
): Promise<Dataset> {
  if (!sources.length || sources.length > limits.entries)
    throw new Error('Превышен лимит числа файлов.');
  if (new Set(sources.map((source) => source.path)).size !== sources.length)
    throw new Error('Повтор пути файла.');
  validateFiles(new Map(sources.map((source) => [source.path, source.bytes])));
  const files = new Map(
    sources.map((source) => [source.path, source.bytes.slice()]),
  );
  const sorted = [...sources].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const entries = await Promise.all(
    sorted.map(async (source) => {
      const bytes = files.get(source.path);
      if (!bytes) throw new Error('Файл отсутствует.');
      return {
        path: source.path,
        format: source.format,
        size: bytes.byteLength,
        sha256: await sha256(bytes),
        license: source.license,
      };
    }),
  );
  const manifest = DatasetManifestSchema.parse({
    kind: 'generated',
    id,
    seed,
    generatorId,
    generatorVersion: DATASET_VERSION,
    files: entries,
  });
  await verifyDataset(manifest, files);
  return { manifest, files, archive: packZip(files) };
}
export async function verifyDataset(
  manifestInput: unknown,
  files: Files,
): Promise<DatasetManifest> {
  const manifest = DatasetManifestSchema.parse(manifestInput);
  validateFiles(files);
  if (manifest.files.length !== files.size)
    throw new Error('Состав набора не совпадает с манифестом.');
  for (const entry of manifest.files) {
    const bytes = files.get(entry.path);
    if (
      !bytes ||
      bytes.byteLength !== entry.size ||
      (await sha256(bytes)) !== entry.sha256
    )
      throw new Error(`Размер или SHA-256 не совпадает: ${entry.path}.`);
    if (
      entry.format === 'odt' ||
      entry.format === 'odp' ||
      entry.format === 'ods'
    )
      validateOdf(bytes, entry.format);
    else if (entry.format === 'zip') readZip(bytes);
    else if (['txt', 'csv', 'json', 'py', 'kum'].includes(entry.format)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0'))
        throw new Error('Нулевой символ в текстовом файле.');
      if (entry.format === 'json') JSON.parse(text);
    } else throw new Error('Формат не поддерживается проверкой этого набора.');
  }
  return manifest;
}
export async function verifyArchive(
  manifest: unknown,
  archive: Uint8Array,
): Promise<DatasetManifest> {
  return verifyDataset(manifest, readZip(archive));
}

/** Own demonstration data for the file infrastructure, not an exam generator. */
export async function createExampleDataset(seed: string): Promise<Dataset> {
  if (seed.length > 200) throw new Error('Seed слишком длинный.');
  const rng = new Rng(seed);
  const prices = Array.from({ length: 12 }, () => rng.int(10, 99) * 10);
  const total = prices.reduce((sum, price) => sum + price, 0);
  const rows = [
    ['Товар', 'Цена'],
    ...prices.map((price, index) => [`Товар ${String(index + 1)}`, price]),
  ] as (string | number)[][];
  const texts = [
    'Учебный набор: цены',
    `Количество товаров: ${String(prices.length)}`,
    `Сумма цен: ${String(total)}`,
  ];
  const source = (
    path: string,
    format: DatasetFile['format'],
    bytes: Uint8Array,
  ): SourceFile => ({ path, format, bytes, license: 'CC0-1.0' });
  return createDataset(`example:${seed}`, seed, DATASET_VERSION, [
    source('texts/условие.txt', 'txt', encoder.encode(texts.join('\n') + '\n')),
    source(
      'tables/цены.csv',
      'csv',
      encoder.encode(rows.map((row) => row.join(';')).join('\n') + '\n'),
    ),
    source('tables/цены.ods', 'ods', makeSpreadsheet(rows)),
    source('document/описание.odt', 'odt', makeDocument(texts)),
    source(
      'presentation/обзор.odp',
      'odp',
      makePresentation([
        { title: texts[0] ?? '', paragraphs: texts.slice(1) },
        {
          title: 'Работа с данными',
          paragraphs: ['Открой таблицу и вычисли сумму цен.'],
        },
      ]),
    ),
    source(
      'reference/ответ.json',
      'json',
      encoder.encode(
        JSON.stringify({ count: prices.length, total, prices }) + '\n',
      ),
    ),
  ]);
}
