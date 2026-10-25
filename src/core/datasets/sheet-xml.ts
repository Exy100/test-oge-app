import { xml } from './odf';
import type { DataCell } from '../generators/14/exam-spreadsheets';

export const sheetNamespaces =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
export interface FormulaCell {
  formula: string;
  value: number;
}
export type SheetCell = DataCell | FormulaCell;
export const sheetCell = (value: SheetCell): string => {
  if (value === '') return '<table:table-cell/>';
  if (typeof value === 'string')
    return `<table:table-cell><text:p>${xml(value)}</text:p></table:table-cell>`;
  const number = typeof value === 'number' ? value : value.value;
  if (!Number.isFinite(number)) throw new Error('Недопустимое число ячейки.');
  return `<table:table-cell office:value-type="float" office:value="${String(number)}"${typeof value === 'number' ? '' : ` table:formula="${xml(value.formula)}"`}/>`;
};
export function pieChart(
  labels: readonly string[],
  values: readonly number[],
): string {
  if (
    labels.length !== 3 ||
    values.length !== 3 ||
    values.some((v) => !Number.isSafeInteger(v) || v < 0) ||
    values.every((v) => v === 0)
  )
    throw new Error('Нужны три непустые категории диаграммы.');
  // Chart's local table requires an explicit string type to retain category
  // names in Calc's legend; ordinary spreadsheet cells can infer it.
  const chartCell = (value: DataCell): string =>
    typeof value === 'string'
      ? `<table:table-cell office:value-type="string"><text:p>${xml(value)}</text:p></table:table-cell>`
      : sheetCell(value);
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${sheetNamespaces} office:version="1.3"><office:automatic-styles><style:style style:name="Series" style:family="chart"><style:chart-properties chart:data-label-number="value"/></style:style></office:automatic-styles><office:body><office:chart><chart:chart chart:class="chart:circle" svg:width="12cm" svg:height="9cm"><chart:legend chart:legend-position="end"/><chart:plot-area table:cell-range-address="local-table.$A$1:.$B$4" chart:data-source-has-labels="both" chart:series-source="columns" svg:x="0.5cm" svg:y="0.5cm" svg:width="8cm" svg:height="8cm"><chart:axis chart:dimension="x" chart:name="primary-x"><chart:categories table:cell-range-address="local-table.$A$2:.$A$4"/></chart:axis><chart:series chart:class="chart:circle" chart:style-name="Series" chart:values-cell-range-address="local-table.$B$2:.$B$4" chart:label-cell-address="local-table.$B$1"><chart:data-point chart:repeated="3"/></chart:series></chart:plot-area><table:table table:name="local-table"><table:table-header-columns><table:table-column/></table:table-header-columns><table:table-columns><table:table-column/></table:table-columns><table:table-header-rows><table:table-row>${chartCell('Категория')}${chartCell('Количество')}</table:table-row></table:table-header-rows><table:table-rows>${labels.map((label, i) => `<table:table-row>${chartCell(label)}${chartCell(values[i] ?? 0)}</table:table-row>`).join('')}</table:table-rows></table:table></chart:chart></office:chart></office:body></office:document-content>`;
}
