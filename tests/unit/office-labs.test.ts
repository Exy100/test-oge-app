import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  documentInitial,
  documentTarget,
  documentChecks,
} from '../../src/lib/interactives/document-format';
import {
  slideTarget,
  slideInitial,
  slideChecks,
  updateFrame,
} from '../../src/lib/interactives/slide-layout';
import {
  labRows,
  evaluateFormula,
  copyFormula,
  chartCounts,
  selectedRows,
} from '../../src/lib/interactives/spreadsheet';
import {
  exportDocument,
  exportSheet,
  openFormula,
} from '../../src/lib/interactives/office-export';
import { validateOdf } from '../../src/core/datasets/odf';
import { XMLParser } from 'fast-xml-parser';
import { exportSlides } from '../../src/lib/interactives/office-slide-export';
const decoder = new TextDecoder();
describe('document properties and actual editable output', () => {
  it.each(['D01', 'D02', 'D03'])(
    '%s distinguishes every property and preserves true merged cells, styles and original text',
    (id) => {
      const target = documentTarget(id);
      expect(documentChecks(id, target).every((check) => check.correct)).toBe(
        true,
      );
      expect(
        documentChecks(id, documentInitial(id, 'text')).filter(
          (check) => !check.correct,
        ).length,
      ).toBeGreaterThan(3);
      expect(
        documentChecks(id, documentInitial(id, 'table')).filter(
          (check) => !check.correct,
        ).length,
      ).toBeGreaterThan(3);
      const files = validateOdf(exportDocument(id, target), 'odt'),
        text = decoder.decode(files.get('content.xml'));
      expect(text).toContain('fo:font-size="14pt"');
      expect(text).toContain('fo:text-indent="1cm"');
      expect(text).toContain('fo:margin-bottom="14pt"');
      expect(text).toContain('style:text-underline-style="solid"');
      expect(text.includes('table:number-columns-spanned="2"')).toBe(
        target.merged,
      );
      expect(decoder.decode(files.get('styles.xml'))).toContain(
        'fo:page-width="21cm"',
      );
      const altered = decoder.decode(
        validateOdf(
          exportDocument(id, {
            ...target,
            fontSize: 12,
            bold: false,
            firstWidth: 6,
          }),
          'odt',
        ).get('content.xml'),
      );
      expect(altered).toContain('fo:font-size="12pt"');
      expect(altered).toContain('style:column-width="6cm"');
      expect(altered).not.toEqual(text);
    },
  );
});
describe('slide geometry uses relationships rather than one coordinate list', () => {
  it.each(['P01', 'P02', 'P11'])(
    '%s checks every frame, preserves three slides and real embedded images',
    (id) => {
      const target = slideTarget(id);
      expect(slideChecks(id, target)).toEqual([]);
      expect(slideChecks(id, slideInitial(id)).length).toBeGreaterThan(1);
      expect(slideChecks(id, updateFrame(target, 1, 1, { x: 1.1 }))).toEqual(
        [],
      );
      expect(
        slideChecks(id, updateFrame(target, 1, 1, { x: 24 })).join(' '),
      ).toContain('за границу');
      expect(
        slideChecks(id, updateFrame(target, 1, 1, { height: 1 })).join(' '),
      ).toContain('пропорции');
      const files = validateOdf(exportSlides(id, target), 'odp'),
        text = decoder.decode(files.get('content.xml'));
      expect(text.match(/<draw:page /gu)).toHaveLength(3);
      expect(
        [...files.keys()].filter((path) => path.endsWith('.png')),
      ).toHaveLength(3);
      for (const slide of target.slides)
        for (const frame of slide.frames)
          if (frame.kind === 'text')
            for (const paragraph of frame.paragraphs)
              expect(text).toContain(paragraph.replaceAll('&', '&amp;'));
      expect(text).toContain('fo:font-size="40pt"');
      expect(text).toContain('fo:font-size="24pt"');
      expect(text).toContain('fo:font-size="20pt"');
    },
  );
});
describe('bounded spreadsheet formulas, compared to independent row enumeration', () => {
  it('evaluates arithmetic, precedence, ranges, zero, headers, nested functions and locale names', () => {
    expect(evaluateFormula('=2+3*4')).toBe(14);
    expect(evaluateFormula('=(2+3)*4')).toBe(20);
    expect(evaluateFormula('=ROUND(1.005;2)')).toBe(1.01);
    expect(evaluateFormula('=ОКРУГЛ(-1.005;2)')).toBe(-1.01);
    expect(evaluateFormula('=-2*-3+1,5')).toBe(7.5);
    const numbers = labRows.slice(1).map((row) => Number(row[3]));
    for (const name of ['SUM', 'СУММ'])
      expect(evaluateFormula(`=${name}(D2:D13)`)).toBe(
        numbers.reduce((a, b) => a + b, 0),
      );
    expect(evaluateFormula('=COUNT(D1:D13)')).toBe(12);
    expect(evaluateFormula('=AVERAGE(D1:D13)')).toBe(
      numbers.reduce((a, b) => a + b, 0) / 12,
    );
    expect(evaluateFormula('=MAX(D2:D13)-MIN(D2:D13)')).toBe(
      [...numbers].sort((a, b) => b - a)[0],
    );
    expect(evaluateFormula('=SUM(SUM(D2:D5);SUM(D6:D13))')).toBe(
      numbers.reduce((a, b) => a + b, 0),
    );
    expect(evaluateFormula('=$D$2+D$3')).toBe(
      Number(labRows[1]?.[3]) + Number(labRows[2]?.[3]),
    );
  });
  it('compares all schools/classes and 500 strict thresholds without inferring hidden-row semantics', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 7, max: 9 }),
        (threshold, grade) => {
          const selected = labRows
            .slice(1)
            .filter((row) => row[2] === grade && Number(row[3]) > threshold);
          expect(
            evaluateFormula(
              `=COUNTIFS(C2:C13;${String(grade)};D2:D13;">${String(threshold)}")`,
            ),
          ).toBe(selected.length);
        },
      ),
      { numRuns: 500, seed: 71014 },
    );
    for (const school of [1, 2, 3]) {
      const sample = labRows.slice(1).filter((row) => row[1] === school),
        values = sample.map((row) => Number(row[3]));
      expect(evaluateFormula(`=SUMIF(B2:B13;${String(school)};D2:D13)`)).toBe(
        values.reduce((a, b) => a + b, 0),
      );
      expect(
        evaluateFormula(`=AVERAGEIF(B2:B13;${String(school)};D2:D13)`),
      ).toBe(values.reduce((a, b) => a + b, 0) / values.length);
    }
    expect(evaluateFormula('=COUNTIF(D2:D13;">=0")')).toBe(12);
    expect(evaluateFormula('=COUNTIF(D2:D13;">0")')).toBe(11);
    expect(chartCounts(labRows.slice(1)).reduce((a, b) => a + b, 0)).toBe(12);
    expect(selectedRows(1, 7, 200)).toEqual(
      labRows
        .slice(1)
        .filter((row) => row[1] === 1 && row[2] === 7 && Number(row[3]) > 200),
    );
  });
  it('copies individual fixed parts, quoted criteria, ranges and the Z/AA boundary', () => {
    expect(copyFormula('=$D2+D$2+$D$2', 1, 1)).toBe('=$D3+E$2+$D$2');
    expect(copyFormula('=COUNTIF(A1:A4;"A1")', 2, 3)).toBe(
      '=COUNTIF(C4:C7;"A1")',
    );
    expect(copyFormula('=Z1+$Z$1', 1, 0)).toBe('=AA1+$Z$1');
    for (const x of [0, 1, 2])
      for (const y of [0, 1, 2]) {
        expect(copyFormula('=$B3+B$3+$B$3', x, y)).toBe(
          `=$B${String(3 + y)}+${String.fromCharCode(66 + x)}$3+$B$3`,
        );
      }
    expect(() => copyFormula('=A1', -1, 0)).toThrow();
    expect(() => copyFormula('=A1', 0, -1)).toThrow();
  });
  it('rejects executable text, malformed input, mismatched ranges, division by zero and empty means', () => {
    for (const formula of [
      'SUM(D2:D13)',
      '=window.alert(1)',
      '=D14',
      '=SUM(D2:D9999)',
      '=SUM(D13:D2)',
      '=1/0',
      '=AVERAGEIF(B2:B13;99;D2:D13)',
      '=COUNTIFS(B2:B13;1;C2:C3;7)',
      '=COUNTIF(D2:D13;"*")',
      '=SUM(',
      '=SUM(D2:D13) trailing',
      '=UNKNOWN(1)',
      '=A1+1',
    ])
      expect(() => evaluateFormula(formula), formula).toThrow();
    expect(() => evaluateFormula('='.padEnd(242, '1'))).toThrow();
    expect(() =>
      evaluateFormula('=' + '('.repeat(25) + '1' + ')'.repeat(25)),
    ).toThrow();
  });
  it('writes actual formulas, source cells and a locally embedded editable chart to ODS', () => {
    const first = '=COUNTIFS(C2:C13;7;D2:D13;">200")',
      second = '=AVERAGEIF(B2:B13;1;D2:D13)';
    expect(openFormula('=СУММ($D2:D$13)')).toBe('of:=SUM([.$D2:.D$13])');
    const files = validateOdf(
      exportSheet({
        first,
        second,
        chartRows: labRows.slice(1),
        legend: true,
        labels: true,
      }),
      'ods',
    );
    const xml = decoder.decode(files.get('content.xml')),
      chart = decoder.decode(files.get('Object1/content.xml'));
    expect(xml).toContain(
      'table:formula="of:=COUNTIFS([.C2:.C13];7;[.D2:.D13];&quot;&gt;200&quot;)"',
    );
    expect(chart).toContain('chart:legend');
    expect(chart).toContain('chart:data-label-number="value"');
    const parsed: unknown = new XMLParser().parse(xml);
    expect(parsed).toBeTruthy();
    const changed = validateOdf(
      exportSheet({
        first: '=SUM(D2:D13)',
        second,
        chartRows: [],
        legend: false,
        labels: false,
      }),
      'ods',
    );
    expect(changed.has('Object1/content.xml')).toBe(false);
  });
});
