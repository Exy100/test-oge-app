import { makeOdf, paragraph, xml } from '../datasets/odf';
import type { DocumentSet } from './document-content';

export function documentMaterial(set: DocumentSet): string[] {
  return [
    set.title,
    ...set.paragraphs,
    set.headers.join(' | '),
    ...set.rows.map((row) => row.join(' | ')),
    `Учебный идентификатор: ${set.id}`,
  ];
}
export function sampleDocumentSet(set: DocumentSet): DocumentSet {
  return {
    ...set,
    title: 'Образец оформления',
    paragraphs: [
      'Этот образец показывает оформление страницы. Перенеси текст своего задания, сохранив параметры абзацев и расположение таблицы.',
      'Заголовок выделен полужирным начертанием. Подпись под таблицей набрана курсивом. Данные в ячейках образца нужно заменить исходными данными задания.',
    ],
    headers: set.headers.map((_, index) => `Поле ${String(index + 1)}`),
    rows: set.rows.map((row, i) =>
      row.map((_, j) => `Данные ${String(i + 1)}.${String(j + 1)}`),
    ),
  };
}
/** A bounded, editable Writer document; no positioned text or rasterized tables. */
export function makeTextDocument(set: DocumentSet): Uint8Array {
  const { format: f } = set;
  if (
    !set.title ||
    set.headers.length < 2 ||
    set.headers.length > 3 ||
    set.rows.length < 3 ||
    set.rows.length > 4 ||
    set.rows.some((row) => row.length !== set.headers.length) ||
    f.widths.length !== set.headers.length ||
    f.widths.some((width) => !Number.isFinite(width) || width < 3) ||
    Math.abs(f.widths.reduce((a, b) => a + b, 0) - 17) > 0.001 ||
    ![12, 14].includes(f.bodySize) ||
    ![115, 150].includes(f.lineHeight) ||
    !['center', 'start'].includes(f.titleAlign) ||
    !['justify', 'start'].includes(f.bodyAlign) ||
    ![0, 1.25].includes(f.indent) ||
    !/^#[0-9A-F]{6}$/u.test(f.headerColor) ||
    [set.title, ...set.paragraphs, ...set.headers, ...set.rows.flat()].some(
      (value) => !value || value.length > 250,
    )
  )
    throw new Error('Недопустимый макет документа.');
  const style = (name: string, family: string, properties: string) =>
    `<style:style style:name="${name}" style:family="${family}">${properties}</style:style>`;
  const para = (properties: string) =>
    `<style:paragraph-properties ${properties}/>`;
  const text = (properties: string) =>
    `<style:text-properties style:font-name="DejaVuSerif" fo:font-family="DejaVu Serif" ${properties}/>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:font-face-decls><style:font-face style:name="DejaVuSerif" fo:font-family="DejaVu Serif"/></office:font-face-decls><office:styles>
    ${style('Title', 'paragraph', para(`fo:text-align="${f.titleAlign}" fo:margin-bottom="0.5cm" fo:keep-with-next="always"`) + text('fo:font-size="18pt" fo:font-weight="bold"'))}
    ${style('Body', 'paragraph', para(`fo:text-align="${f.bodyAlign}" fo:text-indent="${String(f.indent)}cm" fo:line-height="${String(f.lineHeight)}%" fo:margin-bottom="0.3cm"`) + text(`fo:font-size="${String(f.bodySize)}pt"`))}
    ${style('Cell', 'paragraph', para('fo:text-align="start" fo:margin="0cm"') + text('fo:font-size="12pt"'))}
    ${style('Head', 'paragraph', para('fo:text-align="center" fo:margin="0cm"') + text('fo:font-size="12pt" fo:font-weight="bold"'))}
    ${style('Note', 'paragraph', para('fo:text-align="end" fo:margin-top="0.4cm"') + text('fo:font-size="10pt" fo:font-style="italic"'))}
    </office:styles><office:automatic-styles><style:page-layout style:name="A4"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin="2cm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="A4"/></office:master-styles></office:document-styles>`;
  const automaticStyles = `<office:automatic-styles>${style('Grid', 'table', '<style:table-properties style:width="17cm" table:align="left" fo:margin-top="0.3cm"/>')}
    ${f.widths.map((width, i) => style(`Col${String(i)}`, 'table-column', `<style:table-column-properties style:column-width="${String(width)}cm"/>`)).join('')}
    ${style('DataCell', 'table-cell', '<style:table-cell-properties fo:padding="0.15cm" fo:border="0.5pt solid #263238" style:vertical-align="middle"/>')}
    ${style('HeaderCell', 'table-cell', `<style:table-cell-properties fo:padding="0.15cm" fo:border="0.5pt solid #263238" fo:background-color="${xml(f.headerColor)}" style:vertical-align="middle"/>`)}
    </office:automatic-styles>`;
  const row = (cells: readonly string[], header: boolean) =>
    `<table:table-row>${cells.map((value) => `<table:table-cell table:style-name="${header ? 'HeaderCell' : 'DataCell'}" office:value-type="string">${paragraph(value, header ? 'Head' : 'Cell')}</table:table-cell>`).join('')}</table:table-row>`;
  return makeOdf(
    'odt',
    `<office:text>${paragraph(set.title, 'Title')}${set.paragraphs.map((value) => paragraph(value, 'Body')).join('')}<table:table table:name="Данные" table:style-name="Grid">${f.widths.map((_, i) => `<table:table-column table:style-name="Col${String(i)}"/>`).join('')}<table:table-header-rows>${row(set.headers, true)}</table:table-header-rows>${set.rows.map((cells) => row(cells, false)).join('')}</table:table>${paragraph(`Учебный идентификатор: ${set.id}`, 'Note')}</office:text>`,
    { styles, automaticStyles },
  );
}
