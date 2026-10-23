import { createDataset, type Dataset, type SourceFile } from '../../datasets';
import { makeOdf } from '../../datasets/odf';
import {
  sheetCell as cell,
  pieChart,
  type SheetCell as Cell,
} from '../../datasets/sheet-xml';
export { pieChart, type FormulaCell } from '../../datasets/sheet-xml';
import type { TaskInstance } from '../../types';
import {
  spreadsheetGenerators,
  sheetAnswers,
  sheetData,
  sheetFormulas,
  type SheetData,
} from './exam-spreadsheets';

/** Compact cells keep a 1000-record source and editable reference inside existing ZIP limits. */
export function spreadsheetFile(
  d: SheetData,
  reference: boolean,
  score: 0 | 1 | 2 | 3 = 3,
): Uint8Array {
  const a = sheetAnswers(d),
    f = sheetFormulas(d);
  const rows: Cell[][] = [[...d.headers], ...d.rows.map((r) => [...r])];
  if (reference) {
    for (let i = 1; i <= 4; i++) {
      const row = rows[i];
      if (!row) throw new Error('Неполная таблица.');
      while (row.length < 11) row.push('');
    }
    const first = rows[1],
      second = rows[2];
    if (!first || !second) throw new Error('Неполная таблица.');
    first[7] = score >= 1 ? { formula: f[0], value: a.values[0] } : -1;
    second[7] = score >= 2 ? { formula: f[1], value: a.values[1] } : -1;
    a.labels.forEach((label, i) => {
      const row = rows[i + 1];
      if (!row) throw new Error('Неполная таблица.');
      row[9] = label;
      row[10] = { formula: f[i + 2] ?? '', value: a.chart[i] ?? 0 };
    });
  }
  const chart =
    reference && score === 3 ? pieChart(a.labels, a.chart) : undefined;
  const shape = chart
    ? '<table:shapes><draw:frame draw:name="Соотношение категорий" svg:x="13.6cm" svg:y="2.3cm" svg:width="12cm" svg:height="9cm"><draw:object xlink:href="./Object1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></table:shapes>'
    : '';
  const body = `<office:spreadsheet xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"><table:table table:name="Данные"${reference ? ' table:print-ranges="Данные.G1:Данные.O30"' : ''}>${shape}${rows.map((r) => `<table:table-row>${r.map(cell).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet>`;
  return makeOdf('ods', body, chart ? { chart } : {});
}
export async function createSpreadsheetDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const g = spreadsheetGenerators.find((g) => g.id === task.generatorId);
  if (!g || !g.verify(task)) throw new Error('Неизвестный набор таблицы.');
  const kind = spreadsheetGenerators.findIndex((item) => item === g),
    d = sheetData(
      (['sheet-count-range', 'sheet-sum-mean', 'sheet-count-mean'] as const)[
        kind
      ] ?? 'sheet-count-range',
      task.seed,
    ),
    a = sheetAnswers(d);
  const sources: SourceFile[] = [];
  const put = (path: string, format: SourceFile['format'], bytes: Uint8Array) =>
    sources.push({ path, format, bytes, license: 'CC0-1.0' });
  const text = (path: string, value: string) =>
    put(path, 'txt', new TextEncoder().encode(value + '\n'));
  const json = (path: string, value: unknown) =>
    put(
      path,
      'json',
      new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'),
    );
  text(
    'README.txt',
    'Авторский учебный набор №14, CC0-1.0. Все данные вымышлены. Начни с assignment.txt и source/data.ods. Сохрани два расчёта и круговую диаграмму с легендой и значениями в result.ods. После самостоятельной работы открой reference/answer.ods: формулы H2/H3 и J2:K4, редактируемая диаграмма вблизи G6. CSV — UTF-8. Критерии — самооценка, не автоматическая экспертиза файла. Примеры всех баллов находятся в samples/office-scores/14 проекта.',
  );
  text('assignment.txt', task.statement);
  put('source/data.ods', 'ods', spreadsheetFile(d, false));
  put(
    'source/data.csv',
    'csv',
    new TextEncoder().encode(
      [d.headers, ...d.rows].map((r) => r.join(';')).join('\n') + '\n',
    ),
  );
  put('reference/answer.ods', 'ods', spreadsheetFile(d, true));
  json('reference/answers.json', {
    kind: d.kind,
    group: d.group,
    sex: d.sex,
    startDay: d.startDay,
    grade: d.grade,
    threshold: d.threshold,
    answers: a.values,
    chart: a.chart,
    labels: a.labels,
    cells: ['H2', 'H3'],
    chartCell: 'G6',
    rowCount: d.rows.length,
    columns: d.headers.length,
    formulas: sheetFormulas(d),
    referenceId: task.answer.type === 'artifact' ? task.answer.referenceId : '',
  });
  json('criteria.json', {
    kind: 'educational-self-assessment',
    ...task.criteria,
    sources: ['D2025-14', 'D2026-14', 'D2027-14'],
    exceptions: [
      'Ответы в других ячейках допустимы.',
      'Другая эквивалентная точность отображения чисел допустима.',
    ],
    elements: [
      'Первый расчёт',
      'Второй расчёт',
      'Правильные данные и соотношение секторов, легенда и числовые подписи диаграммы',
    ],
  });
  return createDataset(
    task.datasetId ?? '',
    task.seed,
    task.generatorId,
    sources,
  );
}
