import { expect, test } from 'vitest';
import { renderTaskGuidance } from '../../src/lib/task-guidance';
import {
  streamSources,
  resolveStreamTask,
} from '../../src/core/stream/catalog';
import { guidanceExample } from '../fixtures/guidance-example';
import { xssContent } from '../fixtures/xss-content';

const references = streamSources().flatMap((source) =>
  (source.kind === 'curated' ? source.seeds : ['guidance-test']).map(
    (seed) => ({
      generatorId: source.generatorId,
      taskNumber: source.taskNumber,
      seed,
    }),
  ),
);
test.each(references)(
  'all help content renders for $generatorId / $seed',
  (reference) => {
    const task = resolveStreamTask(reference);
    for (let index = 0; index < 3; index += 1) {
      const html = renderTaskGuidance(task, 'hint', index);
      expect(html.length).toBeGreaterThan(10);
      expect(html).not.toMatch(/<(?:script|iframe|img|a)\b/iu);
    }
    for (let index = 0; index < task.solution.length; index += 1) {
      const html = renderTaskGuidance(task, 'solution', index);
      expect(html.length).toBeGreaterThan(10);
      if (task.solution[index]?.code !== undefined)
        expect(html).toContain('<pre tabindex="0"><code>');
      expect(html).not.toMatch(/<(?:script|iframe|img|a)\b/iu);
    }
  },
);
test('markdown, tables, formula and literal code are retained together', () => {
  const task = guidanceExample();
  expect(renderTaskGuidance(task, 'hint', 0)).toContain(
    '<strong>единицы информации</strong>',
  );
  expect(renderTaskGuidance(task, 'hint', 1)).toContain('<math');
  expect(renderTaskGuidance(task, 'solution', 0)).toContain(
    '<table tabindex="0">',
  );
  const math = renderTaskGuidance(task, 'solution', 1);
  expect(math).toContain('<math');
  expect(math).toContain('<mo>×</mo>');
  const code = renderTaskGuidance(task, 'solution', 2);
  expect(code).toContain('print(8 * 8)');
  expect(code).toContain('# ```` и &lt;script&gt;');
  expect(code).not.toMatch(/<(?:img|script)\b/iu);
});
for (const code of ['a\n', 'a', '```\n~~~\n`````\n<img src=x>']) {
  test(`code fence preserves source with ${String(code.length)} characters`, () => {
    const task = guidanceExample();
    task.solution[0] = { text: 'Код', code };
    const html = renderTaskGuidance(task, 'solution', 0);
    expect(html.match(/<pre\b/gu)).toHaveLength(1);
    expect(html.match(/<\/pre>/gu)).toHaveLength(1);
    expect(html).not.toMatch(/<img\b/iu);
    const escaped = code
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    expect(html).toContain(
      `<pre tabindex="0"><code>${escaped}${code.endsWith('\n') ? '' : '\n'}</code></pre>`,
    );
  });
}
test.each(xssContent)(
  'untrusted help text, code and formulas stay inert %#',
  (source) => {
    const task = guidanceExample();
    task.hints[0] = source;
    task.solution[0] = { text: source, code: source, formula: source };
    for (const html of [
      renderTaskGuidance(task, 'hint', 0),
      renderTaskGuidance(task, 'solution', 0),
    ]) {
      expect(html).not.toMatch(
        /<(?:script|iframe|img|svg|a|form|input|style)\b/iu,
      );
      expect(html).not.toMatch(
        /<[^>]*\s(?:onerror|onload|onfocus|href|src|style)\s*=/iu,
      );
    }
  },
);
test('invalid indexes cannot silently disclose another step', () => {
  const task = guidanceExample();
  for (const index of [-1, 0.5, NaN, Infinity, 3])
    for (const kind of ['hint', 'solution'] as const)
      expect(() => renderTaskGuidance(task, kind, index)).toThrow(RangeError);
});
