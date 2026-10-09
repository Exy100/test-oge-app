import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import RichText from '../../components/RichText';
import { renderRichText } from './render';
import { xssContent } from '../../../tests/fixtures/xss-content';

test.each(xssContent)(
  'renders malicious source %# without active elements',
  (source) => {
    const html = renderRichText(source);
    expect(html).not.toMatch(
      /<(?:script|iframe|img|svg|a|form|input|style)\b/iu,
    );
    expect(html).not.toMatch(
      /<[^>]*\s(?:onerror|onload|onfocus|href|src|style)\s*=/iu,
    );
  },
);
test('markdown tables, emphasis and code retain their structure', () => {
  const html = renderRichText(
    '**Байт**\n\n| Единица | Биты |\n| --- | --- |\n| Байт | 8 |\n\n```python\nprint(8 * 8)\n```',
  );
  expect(html).toContain('<strong>Байт</strong>');
  expect(html).toContain('<table>');
  expect(html).toContain('<th>Биты</th>');
  expect(html).toContain('class="language-python"');
  expect(html).toContain('print(8 * 8)');
});
test('inline and display formulas contain accessible MathML without inline styles', () => {
  const html = renderRichText(String.raw`$x^2$ и $$\frac{8}{2}$$`);
  expect(html.match(/<math\b/gu)).toHaveLength(2);
  expect(html).toContain('<msup>');
  expect(html).toContain('<mfrac>');
  expect(html).toContain('display="block"');
  expect(html).not.toContain('style=');
});
test('invalid math shows escaped source and does not prevent other markdown rendering', () => {
  const html = renderRichText(String.raw`$\broken{<img>}$ **Текст**`);
  expect(html).toContain('math-error');
  expect(html).toContain('&lt;img&gt;');
  expect(html).toContain('<strong>Текст</strong>');
});
test('escaped dollars and code are not interpreted as formulas', () => {
  expect(renderRichText(String.raw`\$8 and \$9`)).not.toContain('<math');
  expect(renderRichText('`$x$`\n\n```text\n$x$\n```')).not.toContain('<math');
});
test('React server rendering uses the same sanitised content', () => {
  const source = '$8$\n\n```python\nprint(8)\n```';
  const html = renderToStaticMarkup(createElement(RichText, { source }));
  expect(html).toContain(renderRichText(source));
  expect(html).toContain('<math');
  expect(html).toContain('disabled');
});
