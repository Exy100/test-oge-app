import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { packZip, readZip, limits } from './zip';

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
function paragraph(value: string): string {
  return `<text:p>${xml(value)
    .replace(/ /gu, '<text:s/>')
    .replace(/\t/gu, '<text:tab/>')
    .replace(/\r\n|\r|\n/gu, '<text:line-break/>')}</text:p>`;
}
function makeOdf(kind: OdfKind, body: string): Uint8Array {
  const content = `${header}<office:document-content ${namespaces} office:version="1.3"><office:body>${body}</office:body></office:document-content>`;
  const styles = `${header}<office:document-styles ${namespaces} office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="21cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
  const manifest = `${header}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mimeTypes[kind]}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  return packZip(
    new Map([
      ['mimetype', encoder.encode(mimeTypes[kind])],
      ['content.xml', encoder.encode(content)],
      ['styles.xml', encoder.encode(styles)],
      ['META-INF/manifest.xml', encoder.encode(manifest)],
    ]),
    'mimetype',
  );
}
export function makeDocument(paragraphs: readonly string[]): Uint8Array {
  if (!paragraphs.length || paragraphs.length > 1000)
    throw new Error('Нужно от 1 до 1000 абзацев.');
  return makeOdf(
    'odt',
    `<office:text>${paragraphs.map(paragraph).join('')}</office:text>`,
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
  const pages = slides
    .map(
      (slide, index) =>
        `<draw:page draw:name="Слайд ${String(index + 1)}" draw:master-page-name="Default"><draw:frame svg:x="1cm" svg:y="1cm" svg:width="26cm" svg:height="3cm"><draw:text-box>${paragraph(slide.title)}</draw:text-box></draw:frame><draw:frame svg:x="1cm" svg:y="5cm" svg:width="26cm" svg:height="14cm"><draw:text-box>${slide.paragraphs.map(paragraph).join('')}</draw:text-box></draw:frame></draw:page>`,
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
function parseXml(bytes: Uint8Array): Record<string, unknown> {
  const text = decoder.decode(bytes);
  if (
    bytes.byteLength > limits.file ||
    /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<(?:script:|office:scripts\b)|\sxlink:/iu.test(
      text,
    )
  )
    throw new Error('Недопустимый XML.');
  SyntaxValidator.validate(text, {
    invalidCharSequence: { comment: true, tagValue: true, attrLt: true },
  });
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
  if (files.keys().next().value !== 'mimetype' || files.size !== 4)
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
  const document = record(parseXml(content)['office:document-content']);
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
  if (!Array.isArray(entries) || entries.length !== 3)
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
    paths.get('styles.xml') !== 'text/xml'
  )
    throw new Error('Манифест ODF не совпадает с файлами.');
  record(parseXml(styles)['office:document-styles']);
  return files;
}
