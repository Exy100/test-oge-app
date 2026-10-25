import { makeOdf, xml } from '../../core/datasets/odf';
import { pieChart } from '../../core/datasets/sheet-xml';
import { documentSet, type DocumentSettings } from './document-format';

import {
  labRows,
  tokens,
  functionNames,
  evaluateFormula,
  chartCounts,
} from './spreadsheet';
import { pageStyles } from './office-page';
function firstWord(text: string, style: string) {
  const split = /^(\S+)([\s\S]*)$/u.exec(text);
  return `<text:span text:style-name="${style}">${xml(split?.[1] ?? text)}</text:span>${xml(split?.[2] ?? '')}`;
}
export function exportDocument(id: string, s: DocumentSettings): Uint8Array {
  const set = documentSet(id);
  for (const value of [
    s.fontSize,
    s.indent,
    s.lineHeight,
    s.gap,
    s.firstWidth,
    s.secondWidth,
  ])
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError('Некорректное свойство документа.');
  const textStyle = `<style:text-properties fo:font-family="DejaVu Serif" fo:font-size="${String(s.fontSize)}pt"/>`,
    automaticStyles = `<office:automatic-styles><style:style style:name="Title" style:family="paragraph"><style:paragraph-properties fo:text-align="${s.titleAlign}" fo:margin-bottom="${String(s.gap)}pt"/>${textStyle}</style:style><style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:text-align="${s.bodyAlign}" fo:text-indent="${String(s.indent)}cm" fo:line-height="${String(s.lineHeight)}%" fo:margin-bottom="${String(s.gap)}pt"/>${textStyle}</style:style><style:style style:name="Cell" style:family="paragraph"><style:paragraph-properties fo:text-align="left"/>${textStyle}</style:style><style:style style:name="First" style:family="text"><style:text-properties fo:font-weight="${s.bold ? 'bold' : 'normal'}"/></style:style><style:style style:name="Second" style:family="text"><style:text-properties fo:font-style="${s.italic ? 'italic' : 'normal'}" style:text-underline-style="${s.underline ? 'solid' : 'none'}"/></style:style><style:style style:name="Table" style:family="table"><style:table-properties style:width="${String(s.firstWidth + s.secondWidth)}cm" table:align="${s.tableCentered ? 'center' : 'left'}"/></style:style><style:style style:name="Col1" style:family="table-column"><style:table-column-properties style:column-width="${String(s.firstWidth)}cm"/></style:style><style:style style:name="Col2" style:family="table-column"><style:table-column-properties style:column-width="${String(s.secondWidth)}cm"/></style:style><style:style style:name="TC" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #192C28" style:vertical-align="${s.verticalMiddle ? 'middle' : 'top'}"/></style:style></office:automatic-styles>`;
  const cell = (text: string, merged = false) =>
    `<table:table-cell table:style-name="TC" office:value-type="string"${merged ? ' table:number-columns-spanned="2"' : ''}><text:p text:style-name="Cell">${xml(text)}</text:p></table:table-cell>`;
  const header = (text: string) =>
    `<table:table-row>${cell(text, s.merged)}${s.merged ? '<table:covered-table-cell/>' : cell('')}</table:table-row>`;
  const body = `<office:text><text:p text:style-name="Title">${xml(set.title)}</text:p>${set.paragraphs.map((text, i) => `<text:p text:style-name="Body">${firstWord(text, i === 0 ? 'First' : 'Second')}</text:p>`).join('')}<table:table table:name="Учебная таблица" table:style-name="Table"><table:table-column table:style-name="Col1"/><table:table-column table:style-name="Col2"/>${set.headers.length === 1 ? header(set.headers[0] ?? '') : `<table:table-row>${set.headers.map((text) => cell(text)).join('')}</table:table-row>`}${set.rows.map((row, i) => (set.family === 'sections' && i === 5 ? header(set.sectionTitle) : '') + `<table:table-row>${row.map((text) => cell(text)).join('')}</table:table-row>`).join('')}</table:table></office:text>`;
  return makeOdf('odt', body, {
    styles: pageStyles(21, 29.7, 2),
    automaticStyles,
  });
}
export function openFormula(raw: string): string {
  const list = tokens(raw);
  let result = 'of:=';
  for (let i = 0; i < list.length; i++) {
    const token = list[i];
    if (!token) continue;
    if (token.kind === 'ref') {
      const end = list[i + 2];
      if (list[i + 1]?.text === ':' && end?.kind === 'ref') {
        result += `[.${token.text.toUpperCase()}:.${end.text.toUpperCase()}]`;
        i += 2;
      } else result += `[.${token.text.toUpperCase()}]`;
    } else
      result +=
        token.kind === 'name'
          ? (functionNames[token.text.toUpperCase()] ??
            token.text.toUpperCase())
          : token.kind === 'number'
            ? token.text.replace(',', '.')
            : token.text;
  }
  return result;
}
export interface SheetExport {
  first: string;
  second: string;
  chartRows: readonly (readonly (string | number)[])[];
  legend: boolean;
  labels: boolean;
}
export function exportSheet(s: SheetExport): Uint8Array {
  const first = evaluateFormula(s.first),
    second = evaluateFormula(s.second),
    counts = chartCounts(s.chartRows),
    labels = ['7 класс', '8 класс', '9 класс'];
  let chart = counts.some((value) => value > 0)
    ? pieChart(labels, counts)
    : undefined;
  if (chart && !s.legend) chart = chart.replace(/<chart:legend[^>]*\/>/u, '');
  if (chart && !s.labels)
    chart = chart.replace('chart:data-label-number="value"', '');
  const cell = (value: string | number, formula?: string) =>
    typeof value === 'number'
      ? `<table:table-cell office:value-type="float" office:value="${String(value)}"${formula ? ` table:formula="${xml(formula)}"` : ''}><text:p>${String(value)}</text:p></table:table-cell>`
      : `<table:table-cell office:value-type="string"><text:p>${xml(value)}</text:p></table:table-cell>`;
  const rows = labRows.map((row) => [...row]);
  const output = rows
    .map((row, i) => {
      while (row.length < 11) row.push('');
      let result = row
        .map((value, col) =>
          i === 1 && col === 7
            ? cell(first, openFormula(s.first))
            : i === 2 && col === 7
              ? cell(second, openFormula(s.second))
              : i >= 1 && i <= 3 && col === 9
                ? cell(labels[i - 1] ?? '')
                : i >= 1 && i <= 3 && col === 10
                  ? cell(counts[i - 1] ?? 0)
                  : cell(value),
        )
        .join('');
      if (i === 0)
        result = row
          .map((value, col) =>
            cell(
              col === 7
                ? 'Расчёт'
                : col === 9
                  ? 'Класс'
                  : col === 10
                    ? 'Количество'
                    : value,
            ),
          )
          .join('');
      return `<table:table-row>${result}</table:table-row>`;
    })
    .join('');
  const shape = chart
    ? '<table:shapes><draw:frame draw:name="Соотношение классов" svg:x="13cm" svg:y="3cm" svg:width="12cm" svg:height="9cm"><draw:object xlink:href="./Object1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></table:shapes>'
    : '';
  return makeOdf(
    'ods',
    `<office:spreadsheet xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"><table:table table:name="Данные">${shape}${output}</table:table></office:spreadsheet>`,
    chart ? { chart } : {},
  );
}
