import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderRichText } from '../../src/core/rich-text/render.ts';
import {
  createProseAudit,
  inspectHtml,
  markdownProse,
  sourceProse,
} from '../../scripts/quality/content.mjs';

const glossary = JSON.parse(
  readFileSync(
    new URL('../../scripts/quality/content-glossary.json', import.meta.url),
    'utf8',
  ),
);

test('Russian spelling rejects an actual typo while accepting normal inflected words', () => {
  const audit = createProseAudit();
  audit.check('Проверь решение и исправь ошыбку в ответе.', 'lesson');
  expect(audit.report().findings.map((item) => item.word)).toEqual(['ошыбку']);
});

test('the project glossary keeps a reason for every exact technical word', () => {
  const audit = createProseAudit(glossary);
  audit.check(
    'ФИПИ, ОГЭ, кэш, межстрочный интервал и непрефиксные коды.',
    'lesson',
  );
  expect(audit.report().findings).toEqual([]);
  expect(() => createProseAudit([{ words: ['ошыбка'], reason: '' }])).toThrow(
    'объяснение',
  );
  expect(() =>
    createProseAudit([{ words: ['слово', 'Слово'], reason: 'duplicate' }]),
  ).toThrow('Повтор');
});

test('terminology is checked even when a spelling exception exists', () => {
  const audit = createProseAudit([{ words: ['Огэ'], reason: 'probe' }]);
  audit.check('Огэ: Libreoffice, Python3, utf8, файл result.ods.', 'page');
  expect(
    audit
      .report()
      .findings.filter((item) => item.rule === 'term')
      .map((item) => item.word),
  ).toEqual(['Огэ', 'utf8', 'Libreoffice', 'Python3']);
});

test('prose inspection excludes code but audits titles, descriptions and accessible names', () => {
  const html =
    '<html><head><title>Название</title><meta name="description" content="Описание"></head><body><p>Обычный текст</p><pre>ошыбка</pre><code>ошыбка</code><button aria-label="Подсказка">Открыть</button><svg><title>Схема</title></svg><script>ошыбка</script></body></html>';
  const parsed = inspectHtml(html);
  expect(parsed.text).toEqual(
    expect.arrayContaining([
      'Название',
      'Описание',
      'Обычный текст',
      'Подсказка',
      'Открыть',
      'Схема',
    ]),
  );
  expect(parsed.text.join(' ')).not.toContain('ошыбка');
  expect(
    markdownProse('Проверь `ошыбка`.\n\n```python\nошыбка\n```').join(' '),
  ).toContain('Проверь');
  expect(
    markdownProse('Проверь `ошыбка`.\n\n```python\nошыбка\n```').join(' '),
  ).not.toContain('ошыбка');
});

test('rendered formula errors and valid MathML are distinguished', () => {
  const parsed = inspectHtml(
    renderRichText('Верная формула $x^2$. Ошибка: $\\frac{1}{$.'),
  );
  expect(parsed.formulas).toBe(1);
  expect(parsed.errors).toHaveLength(1);
  expect(parsed.errors[0]).toContain('Не удалось отобразить формулу');
  expect(parsed.text).not.toContain('x');
});

test('source extraction preserves complete interpolated Markdown and JSX text', () => {
  const source =
    'const label = `Проверь ${value} чисел.\n\n```python\n${code}\n```\n\nПродолжи решение.`; const ui = <p>Русский текст</p>;';
  const fragments = sourceProse('src/components/Probe.tsx', source);
  expect(fragments.some((item) => item.text.includes('Проверь 0 чисел.'))).toBe(
    true,
  );
  expect(fragments.some((item) => item.text.includes('Русский текст'))).toBe(
    true,
  );
  expect(
    fragments.flatMap((item) => markdownProse(item.text)).join(' '),
  ).toContain('Продолжи решение');
});

test('code emitters are excluded only in their real source files', () => {
  const source = 'const localPythonChecker = `ошыбка`;';
  expect(
    sourceProse('src/core/generators/16/local-checker.ts', source),
  ).toEqual([]);
  expect(
    sourceProse('src/components/Probe.ts', source).map((item) => item.text),
  ).toEqual(['ошыбка']);
});

test('encoded letter strings do not excuse a spelling error in ordinary prose', () => {
  const audit = createProseAudit();
  audit.check('АБВГДЕ', 'decode-prefix-v2:example');
  audit.check('ошыбка', 'decode-prefix-v2:example');
  audit.check('АБВГДЕ', 'ordinary-page');
  expect(
    audit
      .report()
      .findings.map((item) => item.word)
      .sort(),
  ).toEqual(['АБВГДЕ', 'ошыбка']);
});
