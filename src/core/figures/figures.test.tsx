import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Figure from '../../components/Figure';
import { FigureSpecSchema } from '../schemas/figure';
import { describeFigure } from './describe';
import { layoutDiagram } from './layout';
import { figureExamples } from '../../dev/figure-examples';

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error('Отсутствует пример или элемент раскладки.');
  return value;
}

describe('рисунки', () => {
  it('содержит по три структурных примера каждого вида', () => {
    const counts = new Map<string, number>();
    for (const spec of figureExamples) {
      expect(FigureSpecSchema.safeParse(spec).success).toBe(true);
      counts.set(spec.kind, (counts.get(spec.kind) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    expect([...counts.values()]).toEqual(Array<number>(9).fill(3));
  });
  for (const [index, spec] of figureExamples.entries()) {
    it(`рендер и описание ${String(index)} ${spec.kind}`, () => {
      const text = describeFigure(spec);
      expect(text.startsWith(spec.description)).toBe(true);
      expect(text.length).toBeGreaterThan(spec.description.length + 10);
      const html = renderToStaticMarkup(<Figure spec={spec} />);
      expect(html).toContain('Текстовое описание');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
    });
  }
  it('вычисляет большие веса точно и сохраняет ведущий ноль', () => {
    const spec = {
      kind: 'place-value',
      description: 'Разряды',
      base: 16,
      digits: [0, ...Array<number>(20).fill(15)],
    } as const;
    expect(describeFigure({ ...spec, digits: [...spec.digits] })).toContain(
      String(16n ** 20n),
    );
    expect(describeFigure({ ...spec, digits: [...spec.digits] })).toContain(
      'Цифра 0',
    );
  });
  it('экранирует пользовательские подписи', () => {
    const html = renderToStaticMarkup(
      <Figure
        spec={{
          kind: 'table',
          description: '<script>alert(1)</script>',
          columns: ['<img onerror=alert(1)>'],
          rows: [['<iframe src=x>']],
        }}
      />,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&lt;img');
  });
  it('текст описывает направления, вес и координаты стены', () => {
    expect(describeFigure(required(figureExamples[1]))).toContain(
      'А — В, вес 10',
    );
    expect(describeFigure(required(figureExamples[4]))).toContain('Б → А');
    expect(describeFigure(required(figureExamples[26]))).toContain(
      '(1, 2) и (2, 2)',
    );
  });
  it('укладывает длинные подписи и веса без пересечений', () => {
    const nodes = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      label: 'Длинная кириллическая подпись '.repeat(index + 1),
    }));
    const edges = nodes.flatMap((from, index) =>
      nodes
        .slice(index + 1)
        .map((to) => ({ from: from.id, to: to.id, label: '1234567890' })),
    );
    const first = layoutDiagram(nodes, edges);
    expect(first).toEqual(layoutDiagram(nodes, edges));
    for (let index = 1; index < first.nodes.length; index++)
      expect(required(first.nodes[index]).x).toBeGreaterThan(
        required(first.nodes[index - 1]).x +
          required(first.nodes[index - 1]).width,
      );
    for (let index = 1; index < first.edges.length; index++)
      expect(
        required(first.edges[index]).y - required(first.edges[index - 1]).y,
      ).toBeGreaterThan(28);
    expect(required(first.nodes[0]).y).toBeGreaterThan(
      required(first.edges.at(-1)).y + 28,
    );
  });
  it('не выделяет узел DOM для каждой клетки огромного поля', () => {
    const html = renderToStaticMarkup(
      <Figure
        spec={{
          kind: 'robot-field',
          description: 'Большое поле',
          rows: 100000,
          columns: 100000,
          start: { row: 0, column: 0 },
          painted: [],
          targets: [],
          walls: [],
        }}
      />,
    );
    expect(html.length).toBeLessThan(3000);
  });
});
