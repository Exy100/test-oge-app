import { makeOdf, xml } from '../datasets/odf';
import type { DocumentSet } from './document-content';

export function documentMaterial(set: DocumentSet): string[] {
  return [
    set.title,
    ...set.paragraphs,
    set.headers.join(' | '),
    ...set.rows.flatMap((row, i) => [
      ...(set.family === 'sections' && i === 5 ? [set.sectionTitle] : []),
      row.join(' | '),
    ]),
  ];
}
export function sampleDocumentSet(set: DocumentSet): DocumentSet {
  return {
    ...set,
    title: 'ОБРАЗЕЦ ОФОРМЛЕНИЯ',
    paragraphs: [
      'Этот образец показывает оформление страницы. Перенеси текст задания, сохранив параметры абзацев и расположение таблицы.',
      'Сравни выделения, объединённые ячейки и выравнивание. Данные образца замени материалом задания; отступы и интервалы задавай свойствами абзаца.',
    ],
    rows: set.rows.map((_, i) => [
      `Запись ${String(i + 1)}`,
      `Описание ${String(i + 1)}`,
    ]),
  };
}
export type DocumentExample = 'complete' | 'text-only' | 'title-only';
/** Bounded editable Writer document. Merged rows remain real table cells. */
export function makeTextDocument(
  set: DocumentSet,
  example: DocumentExample = 'complete',
): Uint8Array {
  const f = set.format;
  if (
    !set.title ||
    set.title.length > 250 ||
    set.paragraphs.some((p) => !p || p.length > 1500) ||
    !['description', 'instructions', 'sections'].includes(set.family) ||
    set.headers.length !== (set.family === 'instructions' ? 2 : 1) ||
    set.rows.length < 3 ||
    set.rows.length > 7 ||
    set.rows.some(
      (r) => r.length !== 2 || r.some((c) => !c || c.length > 150),
    ) ||
    f.widths.length !== 2 ||
    f.widths.some((w) => !Number.isFinite(w) || w < 3) ||
    Math.abs(f.widths.reduce((a, b) => a + b, 0) - 15) > 0.001 ||
    ![14].includes(f.bodySize) ||
    !['center'].includes(f.titleAlign) ||
    !['justify'].includes(f.bodyAlign) ||
    f.indent !== 1 ||
    ![115, 150].includes(f.lineHeight) ||
    !/^#[0-9A-F]{6}$/u.test(f.headerColor)
  )
    throw new Error('Недопустимый макет документа.');
  const style = (name: string, family: string, props: string) =>
    `<style:style style:name="${name}" style:family="${family}">${props}</style:style>`;
  const para = (props: string) => `<style:paragraph-properties ${props}/>`;
  const text = (props = '') =>
    `<style:text-properties style:font-name="DejaVuSerif" fo:font-family="DejaVu Serif" fo:font-size="14pt" ${props}/>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:font-face-decls><style:font-face style:name="DejaVuSerif" fo:font-family="DejaVu Serif"/></office:font-face-decls><office:styles>
    ${style('Title', 'paragraph', para('fo:text-align="center" fo:margin-bottom="14pt" fo:keep-with-next="always"') + text())}
    ${style('Body', 'paragraph', para(`fo:text-align="justify" fo:text-indent="1cm" fo:line-height="${String(f.lineHeight)}%" fo:margin-bottom="14pt"`) + text())}
    ${style('Cell', 'paragraph', para('fo:text-align="start" fo:margin="0cm"') + text())}
    ${style('Center', 'paragraph', para('fo:text-align="center" fo:margin="0cm"') + text())}
    ${style('Bold', 'text', text('fo:font-weight="bold"'))}
    ${style('Italic', 'text', text('fo:font-style="italic"'))}
    ${style('Underline', 'text', text('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"'))}
    </office:styles><office:automatic-styles><style:page-layout style:name="A4"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin="2cm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="A4"/></office:master-styles></office:document-styles>`;
  const automaticStyles = `<office:automatic-styles>${style('Grid', 'table', '<style:table-properties style:width="15cm" table:align="center" fo:margin-top="0cm" fo:margin-bottom="14pt"/>')}
    ${f.widths.map((w, i) => style(`Col${String(i)}`, 'table-column', `<style:table-column-properties style:column-width="${String(w)}cm"/>`)).join('')}
    ${style('DataCell', 'table-cell', '<style:table-cell-properties fo:padding="0.12cm" fo:border="0.5pt solid #263238" style:vertical-align="middle"/>')}
    </office:automatic-styles>`;
  const p = (value: string, kind: string) =>
    `<text:p text:style-name="${kind}">${value}</text:p>`;
  const span = (value: string, kind: string) =>
    `<text:span text:style-name="${kind}">${xml(value)}</text:span>`;
  const body = set.paragraphs
    .map((value, i) => {
      const split = value.indexOf(' ', value.indexOf(' ') + 1);
      return p(
        span(value.slice(0, split), i === 0 ? 'Bold' : 'Italic') +
          xml(value.slice(split)),
        'Body',
      );
    })
    .join('');
  const merged = (value: string) =>
    `<table:table-row><table:table-cell table:style-name="DataCell" table:number-columns-spanned="2" office:value-type="string">${p(span(value, 'Underline'), 'Center')}</table:table-cell><table:covered-table-cell/></table:table-row>`;
  const row = (cells: readonly string[], header: boolean) =>
    `<table:table-row>${cells
      .map((value, i) => {
        const centered =
          header || (set.family === 'sections' ? i === 0 : i === 1);
        return `<table:table-cell table:style-name="DataCell" office:value-type="string">${p(header ? span(value, 'Italic') : i === 0 ? span(value, 'Bold') : xml(value), centered ? 'Center' : 'Cell')}</table:table-cell>`;
      })
      .join('')}</table:table-row>`;
  const table = `<table:table table:name="Данные" table:style-name="Grid">${f.widths.map((_, i) => `<table:table-column table:style-name="Col${String(i)}"/>`).join('')}${set.headers.length === 1 ? merged(set.headers[0] ?? '') : row(set.headers, true)}${set.rows.map((r, i) => (set.family === 'sections' && i === 5 ? merged(set.sectionTitle) : '') + row(r, false)).join('')}</table:table>`;
  const title = p(
    set.family === 'instructions'
      ? `<text:span text:style-name="Bold">${span(set.title, 'Underline')}</text:span>`
      : xml(set.title),
    'Title',
  );
  return makeOdf(
    'odt',
    `<office:text>${title}${example === 'title-only' ? '' : example === 'text-only' ? body : set.family === 'instructions' ? table + body : body + table}</office:text>`,
    { styles, automaticStyles },
  );
}
