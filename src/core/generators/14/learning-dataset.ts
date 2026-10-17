import { createDataset, type Dataset } from '../../datasets';
import { makeOdf, makeSpreadsheet, paragraph, xml } from '../../datasets/odf';
import type { TaskInstance } from '../../types';
import { learningGeneratorsForTask as generatorsForTask } from '../learning';
import {
  helperFormula,
  isSheetKind,
  measure,
  resultFormulas,
  selected,
  sheetAnswers,
  sheetData,
  sheetQuestions,
  type SheetData,
  type SheetKind,
} from './spreadsheets';
type FormulaCell = { formula: string; value: number };
type Cell = string | number | FormulaCell;
export function referenceRows(kind: SheetKind, data: SheetData): Cell[][] {
  const answers = sheetAnswers(kind, data),
    formulas = resultFormulas(kind, data),
    questions = sheetQuestions(kind, data);
  return [
    [...data.headers, 'Выбранное значение', '', 'Запрос', 'Ответ'],
    ...data.rows.map((row, index): Cell[] => [
      ...row,
      {
        formula: helperFormula(kind, data, index + 2),
        value: selected(kind, data, row) ? measure(kind, row) : 0,
      },
      '',
      questions[index] ?? '',
      index < 3
        ? { formula: formulas[index] ?? '', value: answers[index] ?? 0 }
        : '',
    ]),
  ];
}
export function formulaSpreadsheet(
  rows: readonly (readonly Cell[])[],
): Uint8Array {
  const content = rows
    .map(
      (row) =>
        `<table:table-row>${row
          .map((value) => {
            if (typeof value === 'string')
              return `<table:table-cell office:value-type="string">${paragraph(value)}</table:table-cell>`;
            const number = typeof value === 'number' ? value : value.value;
            if (!Number.isFinite(number))
              throw new Error('Недопустимое число ячейки.');
            if (
              typeof value !== 'number' &&
              !/^of:=[A-Z]+\(/u.test(value.formula)
            )
              throw new Error('Недопустимая формула.');
            return `<table:table-cell office:value-type="float" office:value="${String(number)}"${typeof value === 'number' ? '' : ` table:formula="${xml(value.formula)}"`}>${paragraph(String(number))}</table:table-cell>`;
          })
          .join('')}</table:table-row>`,
    )
    .join('');
  return makeOdf(
    'ods',
    `<office:spreadsheet xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"><table:table table:name="Данные">${content}</table:table></office:spreadsheet>`,
  );
}
export async function createSpreadsheetDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const generator = generatorsForTask(14).find(
    (item) => item.id === task.generatorId,
  );
  if (!generator || !isSheetKind(task.subtype) || !generator.verify(task))
    throw new Error('Неизвестный набор таблицы.');
  const kind = task.subtype,
    data = sheetData(kind, task.seed),
    answers = sheetAnswers(kind, data);
  const text = (value: unknown) =>
    new TextEncoder().encode(
      typeof value === 'string'
        ? value + '\n'
        : JSON.stringify(value, null, 2) + '\n',
    );
  const csv =
    [data.headers, ...data.rows].map((row) => row.join(';')).join('\n') + '\n';
  return createDataset(task.datasetId ?? '', task.seed, task.generatorId, [
    {
      path: 'README.txt',
      format: 'txt',
      license: 'CC0-1.0',
      bytes: text(
        'Авторский учебный набор №14. CC0-1.0. Открой assignment.txt и source/data.ods. Все записи вымышлены и не содержат персональных данных. Сначала выполни три запроса самостоятельно, затем открой reference/answer.ods. Исходные данные A:D сохраняются. Эталон содержит формулы в E и H2:H4. answers.json и criteria.json — учебная самопроверка, а не автоматическая экспертная оценка. CSV и JSON — UTF-8.',
      ),
    },
    {
      path: 'assignment.txt',
      format: 'txt',
      license: 'CC0-1.0',
      bytes: text(task.statement),
    },
    {
      path: 'source/data.ods',
      format: 'ods',
      license: 'CC0-1.0',
      bytes: makeSpreadsheet([data.headers, ...data.rows]),
    },
    {
      path: 'source/data.csv',
      format: 'csv',
      license: 'CC0-1.0',
      bytes: new TextEncoder().encode(csv),
    },
    {
      path: 'reference/answer.ods',
      format: 'ods',
      license: 'CC0-1.0',
      bytes: formulaSpreadsheet(referenceRows(kind, data)),
    },
    {
      path: 'reference/answers.json',
      format: 'json',
      license: 'CC0-1.0',
      bytes: text({
        kind,
        group: data.group,
        threshold: data.threshold,
        answers,
        cells: ['H2', 'H3', 'H4'],
        rowCount: data.rows.length,
        referenceId:
          task.answer.type === 'artifact' ? task.answer.referenceId : '',
        formulas: resultFormulas(kind, data),
      }),
    },
    {
      path: 'criteria.json',
      format: 'json',
      license: 'CC0-1.0',
      bytes: text({ kind: 'educational-self-assessment', ...task.criteria }),
    },
  ]);
}
