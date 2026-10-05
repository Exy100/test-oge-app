import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { filesIn, formatDiagnostic, lineAt } from './quality/files.mjs';

const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.astro',
  '.mdx',
  '.md',
  '.json',
  '.css',
  '.svg',
  '.html',
  '.txt',
  '.yaml',
  '.yml',
]);
const codeExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);
const patterns = [
  [
    'unfinished',
    /(?<![\p{L}\p{N}_])(?:todo|fixme|xxx|lorem\s+ipsum|coming\s+soon|скоро|в\s+разработке)(?![\p{L}\p{N}_])/giu,
    'Незавершённый текст или заглушка.',
  ],
  [
    'abbreviated-code',
    /\/\/\s*(?:[.…\s]*остальное\s+аналогично|и\s+т\.?\s*д\.?|здесь\s+ваша\s+логика)/giu,
    'Сокращённая реализация вместо кода.',
  ],
  [
    'unimplemented',
    /throw\s+new\s+Error\s*\(\s*['"`]not\s+implemented['"`]/giu,
    'Нереализованная ветка.',
  ],
  [
    'external-script',
    /<script\b[^>]*\bsrc\s*=\s*['"](?:https?:)?\/\//giu,
    'Внешний исполняемый скрипт.',
  ],
  [
    'external-style',
    /@import\s+(?:url\(\s*)?['"](?:https?:)?\/\//giu,
    'Внешний импорт CSS.',
  ],
  [
    'external-font',
    /@font-face\s*\{[^}]*url\(\s*['"]?(?:https?:)?\/\//giu,
    'Шрифт должен размещаться на нашем сайте.',
  ],
  [
    'secret',
    /sk-or-v1-[a-z0-9_-]{16,}/giu,
    'Возможный ключ OpenRouter; значение не выводится.',
  ],
];

const testFile = (file) =>
  /(?:^|\/)tests?\//u.test(file) ||
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file);

/** Inspect code without treating test input strings as unfinished implementations. */
export function inspectSource(file, source, decisions = '') {
  const findings = [];
  const add = (offset, rule, message) =>
    findings.push({ file, line: lineAt(source, offset), rule, message });
  const isTest = testFile(file);
  let patternSource = source;
  let codeSource = source;
  if (file.endsWith('.astro')) {
    codeSource = source.replace(/[^\r\n]/gu, ' ');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
    const parts = [
      ...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu),
    ];
    if (frontmatter) parts.push(frontmatter);
    for (const part of parts) {
      const start = part.index + part[0].indexOf(part[1]);
      codeSource =
        codeSource.slice(0, start) +
        part[1] +
        codeSource.slice(start + part[1].length);
    }
  }
  let tree;
  if (codeExtensions.has(extname(file)) || file.endsWith('.astro')) {
    tree = ts.createSourceFile(
      file,
      codeSource,
      ts.ScriptTarget.Latest,
      true,
      /[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    if (isTest) {
      const ranges = [];
      function collect(node) {
        if (
          ts.isStringLiteralLike(node) ||
          ts.isTemplateExpression(node) ||
          ts.isRegularExpressionLiteral(node)
        ) {
          ranges.push([node.getStart(tree), node.end]);
        } else ts.forEachChild(node, collect);
      }
      collect(tree);
      for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
        patternSource =
          patternSource.slice(0, start) +
          patternSource.slice(start, end).replace(/[^\r\n]/gu, ' ') +
          patternSource.slice(end);
      }
    }
  }
  for (const [rule, pattern, message] of patterns) {
    for (const match of patternSource.matchAll(pattern))
      add(match.index, rule, message);
  }

  // Directives are comments, not strings such as negative-test input.
  const comments = [];
  if (tree) {
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      codeSource,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        comments.push({
          offset: scanner.getTokenStart(),
          text: scanner.getTokenText(),
        });
      }
    }
  } else {
    for (const match of source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu))
      comments.push({ offset: match.index, text: match[0] });
  }
  for (const comment of comments) {
    if (/@ts-ignore\b/iu.test(comment.text))
      add(comment.offset, 'type-suppression', 'Директива ts-ignore запрещена.');
    if (
      /@ts-expect-error\b/iu.test(comment.text) &&
      !(
        isTest &&
        /\.[cm]?tsx?$/u.test(file) &&
        /@ts-expect-error\s*:?\s+\S.{5,}/iu.test(comment.text)
      )
    ) {
      add(
        comment.offset,
        'type-suppression',
        'ts-expect-error допустим только в типовом тесте с объяснением.',
      );
    }
    if (/eslint-disable\b/iu.test(comment.text)) {
      const id = comment.text.match(/\bADR-\d+\b/iu)?.[0].toUpperCase();
      const section = id
        ? decisions
            .split(/(?=^## ADR-)/mu)
            .find((item) => item.startsWith(`## ${id}.`))
        : undefined;
      if (!section?.includes(file))
        add(
          comment.offset,
          'lint-suppression',
          'Для отключения ESLint нужна ссылка на ADR с этим путём.',
        );
    }
  }

  if (tree) {
    const runners = new Set(['test', 'it', 'describe', 'bench']);
    for (const statement of tree.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        ['vitest', '@playwright/test'].includes(statement.moduleSpecifier.text)
      ) {
        const bindings = statement.importClause?.namedBindings;
        if (statement.importClause?.name)
          runners.add(statement.importClause.name.text);
        if (bindings && ts.isNamespaceImport(bindings))
          runners.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements)
            if (runners.has((item.propertyName ?? item.name).text))
              runners.add(item.name.text);
        }
      }
    }
    const access = (node) =>
      ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isElementAccessExpression(node) &&
            node.argumentExpression &&
            ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : undefined;
    function visit(node) {
      const offset = node.getStart(tree);
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        add(offset, 'any-type', 'Явный any запрещён.');
      if (
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)
      ) {
        const name = access(node)?.toLowerCase();
        if (
          file.startsWith('src/core/') &&
          name === 'random' &&
          ts.isIdentifier(node.expression) &&
          node.expression.text.toLowerCase() === 'math'
        )
          add(offset, 'random', 'В ядре нужен RNG с seed.');
        if (
          name === 'cookie' &&
          ts.isIdentifier(node.expression) &&
          node.expression.text.toLowerCase() === 'document'
        )
          add(offset, 'cookies', 'Cookies не используются.');
        if (name === 'only' || name === 'skip') {
          let base = node.expression;
          while (
            ts.isPropertyAccessExpression(base) ||
            ts.isElementAccessExpression(base) ||
            ts.isCallExpression(base)
          )
            base = base.expression;
          if (ts.isIdentifier(base) && runners.has(base.text))
            add(
              offset,
              'disabled-test',
              'Нельзя исключать или выделять тесты через only/skip.',
            );
        }
      }
      if (
        file.startsWith('src/core/') &&
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        node.initializer.text === 'Math'
      ) {
        for (const binding of node.name.elements)
          if (
            (binding.propertyName ?? binding.name)
              .getText(tree)
              .toLowerCase() === 'random'
          )
            add(offset, 'random', 'В ядре нужен RNG с seed.');
      }
      if (
        (ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node)) &&
        node.body &&
        ts.isBlock(node.body) &&
        node.body.statements.length === 0
      )
        add(offset, 'empty-function', 'Пустой обработчик или функция.');
      if (
        (ts.isArrowFunction(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node)) &&
        node.body
      ) {
        const name =
          node.name?.getText(tree) ??
          (ts.isVariableDeclaration(node.parent)
            ? node.parent.name.getText(tree)
            : '');
        const returned = ts.isBlock(node.body)
          ? node.body.statements.length === 1 &&
            ts.isReturnStatement(node.body.statements[0])
            ? node.body.statements[0].expression
            : undefined
          : node.body;
        if (
          /^[A-Z]/u.test(name) &&
          returned &&
          (returned.kind === ts.SyntaxKind.NullKeyword ||
            (ts.isJsxFragment(returned) &&
              returned.children.every(
                (child) => ts.isJsxText(child) && !child.text.trim(),
              )))
        )
          add(
            offset,
            'empty-component',
            'Компонент всегда возвращает пустое содержимое.',
          );
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return findings.sort(
    (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
  );
}

export async function checkForbidden(root = process.cwd()) {
  const files = (
    await Promise.all(
      ['src', 'worker/src', 'tests'].map((directory) =>
        filesIn(root, directory),
      ),
    )
  )
    .flat()
    .filter((file) => textExtensions.has(extname(file)));
  let decisions = '';
  try {
    decisions = await readFile(resolve(root, 'DECISIONS.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const findings = [];
  for (const file of files)
    findings.push(
      ...inspectSource(
        file,
        await readFile(resolve(root, file), 'utf8'),
        decisions,
      ),
    );
  return { files: files.length, findings };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length > 2)
      throw new Error('check:forbidden не принимает аргументы.');
    const result = await checkForbidden();
    for (const item of result.findings) console.error(formatDiagnostic(item));
    console.log(
      `Проверено файлов: ${result.files}; нарушений: ${result.findings.length}.`,
    );
    if (result.findings.length) process.exitCode = 1;
  } catch (error) {
    console.error(`check:forbidden: ${error.message}`);
    process.exitCode = 1;
  }
}
