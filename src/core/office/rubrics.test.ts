import { presentationSets, documentSets } from '../banks/index';
import { deckFor } from '../banks/slide-deck';
import { sheetData, sheetKinds } from '../generators/14/exam-spreadsheets';
import { expect, test } from 'vitest';
import {
  officeRubricFixture,
  officeFixtures,
} from '../../../tests/fixtures/exam/practice';
import {
  assessPresentation,
  assessDocument,
  assessSpreadsheet,
  presentationCriteria,
  documentCriteria,
  spreadsheetCriteria,
} from './rubrics';
const presentation = {
  formatValid: true,
  slides: 3,
  topicMatches: true,
  illustratedContent: true,
  violations: [],
};
const document = {
  formatValid: true,
  mainPresent: true,
  tablesPresent: true,
  mainViolations: 0,
  tableViolations: 0,
  mainTextErrors: 0,
  tableTextErrors: 0,
  substantialLayoutDifference: false,
};
test('the three rubrics retain the independently transcribed official structure and source maxima', () => {
  expect([
    presentationCriteria.max,
    documentCriteria.max,
    spreadsheetCriteria.max,
  ]).toEqual([
    officeRubricFixture.presentation.max,
    officeRubricFixture.document.max,
    officeRubricFixture.spreadsheet.max,
  ]);
  for (const f of officeFixtures)
    expect(f.maxScore).toBe(f.taskNumber === 14 ? 3 : 2);
  expect(officeRubricFixture.document.textErrorAllowances).toEqual([5, 3]);
  expect(officeRubricFixture.spreadsheet.elements).toHaveLength(3);
});
test('presentation systematic errors count once; exactly two complete slides earn one point', () => {
  expect(assessPresentation(presentation)).toBe(2);
  for (const slides of [2, 3])
    expect(assessPresentation({ ...presentation, slides })).toBe(
      slides === 2 ? 1 : 2,
    );
  for (const violations of [['font'], ['font', 'font', 'font']])
    expect(assessPresentation({ ...presentation, violations })).toBe(1);
  expect(
    assessPresentation({ ...presentation, violations: ['font', 'layout'] }),
  ).toBe(0);
  expect(
    assessPresentation({ ...presentation, slides: 2, violations: ['font'] }),
  ).toBe(0);
  for (const change of [
    { slides: 1 },
    { slides: 4 },
    { formatValid: false },
    { topicMatches: false },
    { illustratedContent: false },
  ])
    expect(assessPresentation({ ...presentation, ...change })).toBe(0);
});
test('document groups, 5/3 text error allowances and exceptional one-point paths', () => {
  expect(
    assessDocument({ ...document, mainTextErrors: 5, tableTextErrors: 3 }),
  ).toBe(2);
  expect(assessDocument({ ...document, mainTextErrors: 6 })).toBe(1);
  expect(assessDocument({ ...document, tableTextErrors: 4 })).toBe(1);
  expect(
    assessDocument({ ...document, mainViolations: 3, tableViolations: 3 }),
  ).toBe(1);
  expect(
    assessDocument({ ...document, mainViolations: 4, tableViolations: 4 }),
  ).toBe(0);
  for (const change of [
    { tablesPresent: false },
    { mainPresent: false },
    { tableViolations: 8 },
    { mainViolations: 8 },
    { substantialLayoutDifference: true },
  ])
    expect(assessDocument({ ...document, ...change })).toBe(1);
  expect(
    assessDocument({ ...document, tablesPresent: false, mainPresent: false }),
  ).toBe(0);
  expect(assessDocument({ ...document, formatValid: false })).toBe(0);
  for (const n of [-1, NaN, Infinity, 1.5])
    expect(() => assessDocument({ ...document, mainViolations: n })).toThrow();
});
test('all eight combinations of the three spreadsheet elements and incomplete charts', () => {
  for (let mask = 0; mask < 8; mask++) {
    const e = {
      firstValue: !!(mask & 1),
      secondValue: !!(mask & 2),
      chartData: !!(mask & 4),
      chartGeometry: true,
      chartLegend: true,
      chartLabels: true,
    };
    expect(assessSpreadsheet(e)).toBe(
      Number(e.firstValue) + Number(e.secondValue) + Number(e.chartData),
    );
  }
  for (const key of [
    'chartData',
    'chartGeometry',
    'chartLegend',
    'chartLabels',
  ] as const)
    expect(
      assessSpreadsheet({
        firstValue: true,
        secondValue: true,
        chartData: true,
        chartGeometry: true,
        chartLegend: true,
        chartLabels: true,
        [key]: false,
      }),
    ).toBe(2);
});

test('actual bank layouts and sheet dimensions meet the nine official fixtures', () => {
  for (const f of officeFixtures) {
    if (f.variant13 === 'presentation') {
      for (const set of presentationSets)
        expect(
          deckFor(set).map(
            (slide) =>
              slide.frames.filter((frame) => frame.kind === 'image').length,
          ),
        ).toEqual(f.requirements.imageCounts);
    } else if (f.variant13 === 'document') {
      for (const set of documentSets) {
        expect(set.format.bodySize).toBe(f.requirements.textPt);
        expect(set.format.indent).toBe(f.requirements.firstLineCm);
        expect(set.format.lineHeight / 100).toBeGreaterThanOrEqual(
          Number(f.requirements.minLineSpacing),
        );
        expect(set.format.lineHeight / 100).toBeLessThanOrEqual(
          Number(f.requirements.maxLineSpacing),
        );
      }
      if (f.year === 2027)
        expect([
          f.requirements.tables,
          f.requirements.mergedSectionRows,
        ]).toEqual([1, 2]);
    } else {
      const kind = sheetKinds[f.year - 2025];
      if (!kind) throw new Error('Missing sourced family');
      const data = sheetData(kind, 'official-structure');
      expect(data.rows.length).toBe(f.requirements.rows);
      expect(data.headers.length).toBe(f.requirements.columns);
    }
  }
});
