import DOMPurify from 'isomorphic-dompurify';
import MarkdownIt from 'markdown-it';
import nspell from 'nspell';
import russian from 'dictionary-ru';
import ts from 'typescript';

const markdown = new MarkdownIt({ html: false });
const dictionary = nspell(russian);
const ignored = 'pre, code, kbd, samp, script, style, math, template';
const terms = [
  {
    pattern: /(?<![\p{L}])(?:Огэ|огэ|Фипи|фипи)(?![\p{L}])/gu,
    preferred: 'ОГЭ / ФИПИ',
  },
  {
    pattern: /(?<![\p{L}\p{N}_.])(?:UTF8|Utf-8|utf8|utf-8)(?![\p{L}\p{N}_])/gu,
    preferred: 'UTF-8',
  },
  {
    pattern: /\b(?:Java Script|Javascript|Web GL|Webgl)\b/gu,
    preferred: 'JavaScript / WebGL',
  },
  { pattern: /\b(?:Libre Office|Libreoffice)\b/gu, preferred: 'LibreOffice' },
  { pattern: /\b(?:Power Point|Powerpoint)\b/gu, preferred: 'PowerPoint' },
  { pattern: /\bPython3\b/gu, preferred: 'Python 3' },
  {
    pattern: /(?<![\p{L}\p{N}_.])(?:pdf|odt|odp|ods)(?![\p{L}\p{N}_])/gu,
    preferred: 'PDF / ODT / ODP / ODS',
  },
];

/** Inspect the actual DOM, excluding code and mathematical notation from prose. */
export function inspectHtml(source) {
  const root = DOMPurify.sanitize(source, {
    RETURN_DOM: true,
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['meta'],
    ADD_ATTR: ['name', 'content'],
  });
  const errors = [
    ...root.querySelectorAll('.math-error, .katex-error, merror'),
  ].map((node) => node.textContent.trim());
  const text = [];
  function visit(node) {
    if (node.nodeType === 3) {
      const value = node.textContent.replace(/\s+/gu, ' ').trim();
      if (value) text.push(value);
      return;
    }
    if (node.nodeType !== 1 || node.matches(ignored)) return;
    for (const name of ['alt', 'title', 'aria-label']) {
      const value = node.getAttribute(name);
      if (value) text.push(value);
    }
    if (
      node.tagName === 'META' &&
      node.getAttribute('name') === 'description'
    ) {
      const value = node.getAttribute('content');
      if (value) text.push(value);
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(root);
  const formulaNodes = [...root.querySelectorAll('math')];
  return {
    text,
    errors,
    formulas: formulaNodes.length,
    formulaSources: formulaNodes.map((node) =>
      (
        node.querySelector('annotation')?.textContent ?? node.textContent
      ).trim(),
    ),
  };
}

export function markdownProse(source) {
  return inspectHtml(markdown.render(source)).text;
}

/** Use complete templates so interpolations cannot break Markdown code fences. */
export function sourceProse(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const programSource =
    /\/generators\/(?:15\/robots|16\/programs|16\/local-checker)\.ts$/u.test(
      file,
    );
  const result = [];
  function add(node, text) {
    if (/[А-ЯЁа-яё]{2}/u.test(text))
      result.push({
        text,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      });
  }
  function visit(node) {
    if (
      programSource &&
      ts.isVariableDeclaration(node) &&
      ['robotPrograms', 'paintByWall', 'tooth', 'localPythonChecker'].includes(
        node.name.getText(ast),
      )
    )
      return;
    if (
      programSource &&
      ts.isFunctionDeclaration(node) &&
      ['referenceProgram', 'referencePython'].includes(node.name?.text)
    )
      return;
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'RegExp')
      return;
    if (ts.isTemplateExpression(node)) {
      add(
        node,
        node.head.text +
          node.templateSpans.map((span) => '0' + span.literal.text).join(''),
      );
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node))
      add(node, node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}

export function createProseAudit(glossary = []) {
  const allowed = new Set();
  for (const entry of glossary) {
    if (!entry.reason?.trim() || !entry.words?.length)
      throw new Error('Каждому слову проекта нужно объяснение.');
    for (const word of entry.words) {
      const key = word.toLocaleLowerCase('ru');
      if (allowed.has(key)) throw new Error(`Повтор слова в словаре: ${word}`);
      allowed.add(key);
    }
  }
  const cache = new Map();
  const used = new Set();
  const unknown = new Map();
  const findings = [];
  let words = 0;
  function check(text, location) {
    for (const term of terms) {
      for (const match of text.matchAll(term.pattern))
        findings.push({
          rule: 'term',
          location,
          word: match[0],
          message: `Используй ${term.preferred}.`,
        });
    }
    for (const match of text.matchAll(/[А-ЯЁа-яё]+(?:-[А-ЯЁа-яё]+)*/gu)) {
      const word = match[0].normalize('NFC');
      if (word.length < 2) continue;
      // Encoded messages and graph edge labels are symbol sequences, not prose.
      if (
        /^[А-Е]{2,}$/u.test(word) &&
        /(?:\/i[24]\/|\/02\/|CodeDecoder|\/decoder\.ts|decode-guidance|^decode-)/u.test(
          location,
        )
      )
        continue;
      words++;
      const key = word.toLocaleLowerCase('ru');
      if (allowed.has(key)) {
        used.add(key);
        continue;
      }
      if (!cache.has(word)) cache.set(word, dictionary.correct(word));
      if (cache.get(word)) continue;
      const item = unknown.get(word) ?? {
        rule: 'spelling',
        word,
        locations: new Set(),
      };
      if (item.locations.size < 5) item.locations.add(location);
      unknown.set(word, item);
    }
  }
  function report() {
    return {
      words,
      uniqueWords:
        new Set([...cache.keys()].map((word) => word.toLocaleLowerCase('ru')))
          .size + used.size,
      findings: [
        ...findings,
        ...[...unknown.values()].map((item) => ({
          ...item,
          locations: [...item.locations],
        })),
      ],
      usedGlossary: [...used].sort(),
    };
  }
  return { check, report };
}
