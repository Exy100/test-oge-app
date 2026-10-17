/** Self-assessment of reported facts, never an automatic examination of a pupil's file. */
export interface PresentationEvidence {
  formatValid: boolean;
  slides: number;
  topicMatches: boolean;
  illustratedContent: boolean;
  /** Repeated mistakes of one kind use the same identifier. */
  violations: readonly string[];
}
export function assessPresentation(evidence: PresentationEvidence): 0 | 1 | 2 {
  if (!evidence.formatValid || !evidence.topicMatches) return 0;
  const errors = new Set(evidence.violations).size;
  if (evidence.slides === 3 && evidence.illustratedContent && errors === 0)
    return 2;
  if (
    (evidence.slides === 3 && evidence.illustratedContent && errors <= 1) ||
    (evidence.slides === 2 && evidence.illustratedContent && errors === 0)
  )
    return 1;
  return 0;
}
export interface DocumentEvidence {
  formatValid: boolean;
  mainPresent: boolean;
  tablesPresent: boolean;
  mainViolations: number;
  tableViolations: number;
  mainTextErrors: number;
  tableTextErrors: number;
  substantialLayoutDifference: boolean;
}
export function assessDocument(e: DocumentEvidence): 0 | 1 | 2 {
  for (const n of [
    e.mainViolations,
    e.tableViolations,
    e.mainTextErrors,
    e.tableTextErrors,
  ])
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error('Число нарушений должно быть целым и неотрицательным.');
  if (!e.formatValid) return 0;
  // The text-error allowances are individual requirements of the two groups.
  const main = e.mainViolations + (e.mainTextErrors > 5 ? 1 : 0);
  const table = e.tableViolations + (e.tableTextErrors > 3 ? 1 : 0);
  const mainCorrect = e.mainPresent && main === 0;
  const tableCorrect = e.tablesPresent && table === 0;
  if (mainCorrect && tableCorrect && !e.substantialLayoutDifference) return 2;
  if (
    (e.mainPresent && e.tablesPresent && main <= 3 && table <= 3) ||
    mainCorrect ||
    tableCorrect
  )
    return 1;
  return 0;
}
export interface SpreadsheetEvidence {
  firstValue: boolean;
  secondValue: boolean;
  chartData: boolean;
  chartGeometry: boolean;
  chartLegend: boolean;
  chartLabels: boolean;
}
export function assessSpreadsheet(e: SpreadsheetEvidence): 0 | 1 | 2 | 3 {
  const chart =
    e.chartData && e.chartGeometry && e.chartLegend && e.chartLabels;
  return (Number(e.firstValue) + Number(e.secondValue) + Number(chart)) as
    0 | 1 | 2 | 3;
}
export const presentationCriteria = {
  max: 2 as const,
  levels: [
    {
      score: 0 as const,
      description:
        'Не выполнены условия на 1 или 2 балла либо файл имеет недопустимый формат.',
    },
    {
      score: 1 as const,
      description:
        'Три слайда по теме, на втором и третьем есть текст и иллюстрации; не более одной ошибки в структуре, шрифте или изображениях. Однотипные ошибки считаются одной. Либо два слайда по теме без таких ошибок.',
    },
    {
      score: 2 as const,
      description:
        'Три слайда полностью соответствуют теме, макетам, размерам шрифта и требованиям к изображениям; ошибок нет.',
    },
  ],
};
export const documentCriteria = {
  max: 2 as const,
  levels: [
    {
      score: 0 as const,
      description:
        'Не выполнены условия на 1 или 2 балла либо файл имеет недопустимый формат.',
    },
    {
      score: 1 as const,
      description:
        'В основном тексте и таблицах не более трёх нарушений требований в каждой группе. Либо одна группа выполнена полностью верно, а другая отсутствует или содержит более трёх нарушений. Также 1 балл при верной работе с существенными расхождениями макета.',
    },
    {
      score: 2 as const,
      description:
        'Основной текст и таблицы оформлены по образцу. В основном тексте допускается до пяти текстовых ошибок, в таблицах — до трёх; остальные требования выполнены.',
    },
  ],
};
export const spreadsheetCriteria = {
  max: 3 as const,
  levels: [
    {
      score: 0 as const,
      description: 'Ни один из трёх элементов не выполнен верно.',
    },
    {
      score: 1 as const,
      description:
        'Верно выполнен один элемент: первый расчёт, второй расчёт или диаграмма.',
    },
    {
      score: 2 as const,
      description: 'Верно выполнены два из трёх элементов.',
    },
    {
      score: 3 as const,
      description:
        'Оба числа найдены верно; диаграмма отображает правильные данные и их соотношение, содержит легенду и числовые подписи.',
    },
  ],
};
