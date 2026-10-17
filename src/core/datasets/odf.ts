import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { packZip, readZip, limits } from './zip';
import { readPng } from './png';

export type OdfKind = 'odt' | 'odp' | 'ods';
export const mimeTypes = Object.freeze({
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
});
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const namespaces =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
const header = '<?xml version="1.0" encoding="UTF-8"?>';
export function xml(value: string): string {
  if (value.length > 100_000) throw new Error('Недопустимый текст XML.');
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    )
      throw new Error('Недопустимый текст XML.');
  }
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
function checkTextBudget(values: readonly string[]): void {
  let total = 0;
  for (const value of values) {
    if (value.length > 100_000)
      throw new Error('Превышен размер входного текста.');
    total += encoder.encode(value).byteLength;
    if (total > limits.file)
      throw new Error('Превышен размер входного текста.');
  }
}
export function paragraph(value: string, style?: string): string {
  return `<text:p${style ? ` text:style-name="${xml(style)}"` : ''}>${xml(value)
    .replace(/ /gu, '<text:s/>')
    .replace(/\t/gu, '<text:tab/>')
    .replace(/\r\n|\r|\n/gu, '<text:line-break/>')}</text:p>`;
}
export function makeOdf(
  kind: OdfKind,
  body: string,
  options: {
    styles?: string;
    automaticStyles?: string;
    images?: ReadonlyMap<string, Uint8Array>;
    chart?: string;
  } = {},
): Uint8Array {
  const chart = options.chart;
  if (chart !== undefined && kind !== 'ods')
    throw new Error('Диаграмма разрешена только в ODS.');
  if (chart !== undefined) validateChart(encoder.encode(chart));
  const images = options.images ?? new Map<string, Uint8Array>();
  if (images.size && kind !== 'odp')
    throw new Error('Иллюстрации разрешены только в презентациях.');
  for (const [path, bytes] of images) {
    if (!/^Pictures\/image-[1-3]\.png$/u.test(path))
      throw new Error('Недопустимый путь иллюстрации.');
    readPng(bytes);
  }
  const content = `${header}<office:document-content ${namespaces}${images.size || chart !== undefined ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ''} office:version="1.3">${options.automaticStyles ?? ''}<office:body>${body}</office:body></office:document-content>`;
  const styles =
    options.styles ??
    `${header}<office:document-styles ${namespaces} office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="21cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
  const manifest = `${header}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mimeTypes[kind]}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${[...images.keys()].map((path) => `<manifest:file-entry manifest:full-path="${xml(path)}" manifest:media-type="image/png"/>`).join('')}${chart === undefined ? '' : '<manifest:file-entry manifest:full-path="Object1/" manifest:media-type="application/vnd.oasis.opendocument.chart"/><manifest:file-entry manifest:full-path="Object1/content.xml" manifest:media-type="text/xml"/>'}</manifest:manifest>`;
  return packZip(
    new Map([
      ['mimetype', encoder.encode(mimeTypes[kind])],
      ['content.xml', encoder.encode(content)],
      ['styles.xml', encoder.encode(styles)],
      ['META-INF/manifest.xml', encoder.encode(manifest)],
      ...images,
      ...(chart === undefined
        ? []
        : [
            ['Object1/content.xml', encoder.encode(chart)] as [
              string,
              Uint8Array,
            ],
          ]),
    ]),
    'mimetype',
  );
}
export function makeDocument(paragraphs: readonly string[]): Uint8Array {
  if (!paragraphs.length || paragraphs.length > 1000)
    throw new Error('Нужно от 1 до 1000 абзацев.');
  checkTextBudget(paragraphs);
  return makeOdf(
    'odt',
    `<office:text>${paragraphs.map((value) => paragraph(value)).join('')}</office:text>`,
  );
}
export interface Slide {
  title: string;
  paragraphs: readonly string[];
}
export function makePresentation(slides: readonly Slide[]): Uint8Array {
  if (
    !slides.length ||
    slides.length > 50 ||
    slides.some((slide) => slide.paragraphs.length > 100)
  )
    throw new Error('Превышен размер презентации.');
  checkTextBudget(
    slides.flatMap((slide) => [slide.title, ...slide.paragraphs]),
  );
  const pages = slides
    .map(
      (slide, index) =>
        `<draw:page draw:name="Слайд ${String(index + 1)}" draw:master-page-name="Default"><draw:frame svg:x="1cm" svg:y="1cm" svg:width="26cm" svg:height="3cm"><draw:text-box>${paragraph(slide.title)}</draw:text-box></draw:frame><draw:frame svg:x="1cm" svg:y="5cm" svg:width="26cm" svg:height="14cm"><draw:text-box>${slide.paragraphs.map((value) => paragraph(value)).join('')}</draw:text-box></draw:frame></draw:page>`,
    )
    .join('');
  return makeOdf('odp', `<office:presentation>${pages}</office:presentation>`);
}
export type Cell = string | number;
export function makeSpreadsheet(
  rows: readonly (readonly Cell[])[],
): Uint8Array {
  if (
    !rows.length ||
    rows.length > 1000 ||
    rows.some(
      (row) => !row.length || row.length > 50 || row.length !== rows[0]?.length,
    )
  )
    throw new Error('Нужна прямоугольная таблица до 1000 × 50.');
  checkTextBudget(rows.flat().filter((value) => typeof value === 'string'));
  const content = rows
    .map(
      (row) =>
        `<table:table-row>${row
          .map((value) => {
            if (typeof value === 'number') {
              if (
                !Number.isFinite(value) ||
                Object.is(value, -0) ||
                Math.abs(value) > 1e12
              )
                throw new Error('Недопустимое число ячейки.');
              return `<table:table-cell office:value-type="float" office:value="${String(value)}">${paragraph(String(value))}</table:table-cell>`;
            }
            return `<table:table-cell office:value-type="string">${paragraph(value)}</table:table-cell>`;
          })
          .join('')}</table:table-row>`,
    )
    .join('');
  return makeOdf(
    'ods',
    `<office:spreadsheet><table:table table:name="Данные">${content}</table:table></office:spreadsheet>`,
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Недопустимая структура XML.');
  return value as Record<string, unknown>;
}
function parseXml(
  bytes: Uint8Array,
  imageLinks = false,
): Record<string, unknown> {
  const text = decoder.decode(bytes);
  if (
    bytes.byteLength > limits.file ||
    (!imageLinks && /\sxlink:/iu.test(text)) ||
    /&(?!(?:amp|lt|gt|quot|apos);)/u.test(text) ||
    /<!DOCTYPE|<!ENTITY|<!--|<!\[CDATA\[|\]\]>|<\?xml-stylesheet|<(?:script:|office:scripts\b)/iu.test(
      text,
    )
  )
    throw new Error('Недопустимый XML.');
  // This generated profile has no comments, CDATA, DTD or custom entities.
  // Check XML characters explicitly as the portable validator accepts some controls.
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    )
      throw new Error('Недопустимый символ XML.');
  }
  let inTag = false;
  let quote = '';
  for (const character of text) {
    if (!inTag) {
      if (character === '<') inTag = true;
    } else if (character === '<')
      throw new Error('Недопустимый знак в теге XML.');
    else if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') inTag = false;
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- ADR-027: portable XML validation until the replacement supports browsers.
  if (XMLValidator.validate(text) !== true)
    throw new Error('Недопустимый синтаксис XML.');
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(text);
  return record(parsed);
}
/** Validates the generated ODF profile, not arbitrary user office documents. */
export function validateOdf(
  bytes: Uint8Array,
  kind: OdfKind,
): Map<string, Uint8Array> {
  const files = readZip(bytes);
  if (files.keys().next().value !== 'mimetype' || files.size < 4)
    throw new Error('Неверный состав ODF.');
  const mime = files.get('mimetype');
  const content = files.get('content.xml');
  const manifest = files.get('META-INF/manifest.xml');
  const styles = files.get('styles.xml');
  if (
    !mime ||
    !content ||
    !manifest ||
    !styles ||
    decoder.decode(mime) !== mimeTypes[kind]
  )
    throw new Error('Тип или файлы ODF не совпадают.');
  const chart = files.get('Object1/content.xml');
  if (chart) {
    if (kind !== 'ods') throw new Error('Диаграмма не соответствует типу ODF.');
    validateChart(chart);
  }
  const imagePaths = [...files.keys()].filter(
    (path) =>
      ![
        'mimetype',
        'content.xml',
        'styles.xml',
        'META-INF/manifest.xml',
        ...(chart ? ['Object1/content.xml'] : []),
      ].includes(path),
  );
  if (
    imagePaths.some(
      (path) => kind !== 'odp' || !/^Pictures\/image-[1-3]\.png$/u.test(path),
    )
  )
    throw new Error('Неверный состав ODF.');
  for (const path of imagePaths) {
    const image = files.get(path);
    if (!image) throw new Error('Иллюстрация отсутствует.');
    readPng(image);
  }
  const parsedContent = parseXml(
    content,
    imagePaths.length > 0 || chart !== undefined,
  );
  function checkLinks(value: unknown, tag = ''): void {
    if (Array.isArray(value)) {
      for (const item of value) checkLinks(item, tag);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(node)) {
      if (key.startsWith('@_xlink:')) {
        const allowed =
          (tag === 'draw:image' ||
            (tag === 'draw:object' && chart !== undefined)) &&
          (key === '@_xlink:href'
            ? typeof item === 'string' &&
              (tag === 'draw:object'
                ? item === './Object1'
                : imagePaths.includes(item))
            : key === '@_xlink:type'
              ? item === 'simple'
              : key === '@_xlink:show'
                ? item === 'embed'
                : key === '@_xlink:actuate' && item === 'onLoad');
        if (!allowed) throw new Error('Недопустимая ссылка ODF.');
      } else checkLinks(item, key);
    }
    if (
      (tag === 'draw:image' || tag === 'draw:object') &&
      (typeof node['@_xlink:href'] !== 'string' ||
        node['@_xlink:type'] !== 'simple')
    )
      throw new Error('Недопустимая иллюстрация ODF.');
  }
  checkLinks(parsedContent);
  const document = record(parsedContent['office:document-content']);
  if (
    document['@_office:version'] !== '1.3' ||
    document['@_xmlns:office'] !==
      'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
  )
    throw new Error('Неверное пространство имён ODF.');
  const body = record(document['office:body']);
  const expected = {
    odt: 'office:text',
    odp: 'office:presentation',
    ods: 'office:spreadsheet',
  }[kind];
  if (!Object.hasOwn(body, expected) || Object.keys(body).length !== 1)
    throw new Error('Содержимое не соответствует типу ODF.');
  const root = record(parseXml(manifest)['manifest:manifest']);
  if (
    root['@_xmlns:manifest'] !==
    'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'
  )
    throw new Error('Неверное пространство имён манифеста.');
  const entries = root['manifest:file-entry'];
  if (
    !Array.isArray(entries) ||
    entries.length !== 3 + imagePaths.length + (chart ? 2 : 0)
  )
    throw new Error('Неверный манифест ODF.');
  const paths = new Map<string, string>();
  for (const entry of entries as unknown[]) {
    const item = record(entry);
    const path = item['@_manifest:full-path'];
    const type = item['@_manifest:media-type'];
    if (typeof path !== 'string' || typeof type !== 'string' || paths.has(path))
      throw new Error('Неверная запись манифеста ODF.');
    paths.set(path, type);
  }
  if (
    paths.get('/') !== mimeTypes[kind] ||
    paths.get('content.xml') !== 'text/xml' ||
    paths.get('styles.xml') !== 'text/xml' ||
    (chart !== undefined &&
      (paths.get('Object1/') !== 'application/vnd.oasis.opendocument.chart' ||
        paths.get('Object1/content.xml') !== 'text/xml')) ||
    imagePaths.some((path) => paths.get(path) !== 'image/png')
  )
    throw new Error('Манифест ODF не совпадает с файлами.');
  record(parseXml(styles)['office:document-styles']);
  return files;
}

/** The sole additional ODS resource is a passive local pie chart, no external links. */
function validateChart(bytes: Uint8Array): void {
  const root = record(parseXml(bytes)['office:document-content']);
  if (root['@_office:version'] !== '1.3')
    throw new Error('Неверная версия диаграммы.');
  const body = record(
    record(record(root['office:body'])['office:chart'])['chart:chart'],
  );
  if (body['@_chart:class'] !== 'chart:circle')
    throw new Error('Нужна круговая диаграмма.');
  const table = record(body['table:table']);
  if (table['@_table:name'] !== 'local-table')
    throw new Error('Неверные данные диаграммы.');
}
