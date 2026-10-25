import { createProcessor } from '@mdx-js/mdx';
import { parseDocument } from 'yaml';
import { lineAt } from './files.mjs';
import { createLessonSchema } from '../../src/lib/lessons/schema.ts';

const jsx = (node) =>
  node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';

function descendants(node, names) {
  if (jsx(node) && names.includes(node.name)) return [node];
  return (node.children ?? []).flatMap((child) => descendants(child, names));
}

function attribute(node, name) {
  return node.attributes?.find(
    (item) => item.type === 'mdxJsxAttribute' && item.name === name,
  )?.value;
}

export function readLesson(file, source, config) {
  const findings = [];
  const fail = (line, message) =>
    findings.push({ file, line, rule: 'lesson', message });
  const frontmatter = source.match(
    /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u,
  );
  if (!frontmatter)
    return {
      findings: [
        { file, line: 1, rule: 'lesson', message: 'Нужен YAML frontmatter.' },
      ],
    };
  let data;
  let tree;
  const body = source.slice(frontmatter[0].length);
  const offset = lineAt(source, frontmatter[0].length) - 1;
  try {
    const doc = parseDocument(frontmatter[1], { uniqueKeys: true });
    if (doc.errors.length) throw doc.errors[0];
    data = doc.toJS({ maxAliasCount: 50 });
    tree = createProcessor().parse(body);
  } catch (error) {
    fail(1, `Не удалось разобрать YAML/MDX: ${error.message}`);
    return { findings };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(1, 'Frontmatter должен быть объектом.');
    return { findings };
  }
  const metadata = createLessonSchema(config.sections).safeParse(data);
  if (!metadata.success)
    for (const issue of metadata.error.issues)
      fail(1, `${issue.path.join('.')}: ${issue.message}`);

  // A one-line JSX component containing prose is wrapped in an MDX paragraph.
  // Unwrap only that container; code fences and expressions never count as blocks.
  const elements = tree.children.flatMap((node) =>
    node.type === 'paragraph'
      ? node.children.filter(jsx)
      : jsx(node)
        ? [node]
        : [],
  );
  const blocks = elements.filter(
    (node) =>
      config.blocks.includes(node.name) || node.name === 'InteractiveFallback',
  );
  const names = blocks.map((node) =>
    node.name === 'InteractiveFallback' ? 'Interactive' : node.name,
  );
  for (const name of config.blocks)
    if (!names.includes(name)) fail(offset + 1, `Нет блока ${name}.`);
  for (const name of config.blocks.filter((item) => item !== 'Interactive'))
    if (names.filter((item) => item === name).length > 1)
      fail(offset + 1, `Блок ${name} повторён.`);
  if (
    names.some(
      (name, index) =>
        index > 0 &&
        config.blocks.indexOf(name) < config.blocks.indexOf(names[index - 1]),
    )
  )
    fail(offset + 1, 'Нарушен порядок блоков урока.');
  const counts = Object.fromEntries(
    config.blocks.map((name) => [
      name,
      names.filter((item) => item === name).length,
    ]),
  );
  const count = (blockName, childNames, minimum) => {
    const block = blocks.find((node) => node.name === blockName);
    const actual = block ? descendants(block, childNames).length : 0;
    if (block && actual < minimum)
      fail(
        offset + (block.position?.start.line ?? 1),
        `${blockName}: нужно не менее ${minimum} элементов ${childNames.join('/')}.`,
      );
  };
  count('Theory', ['Figure', 'svg'], config.visualizations);
  count('Examples', ['Example'], config.examples);
  count('Mistakes', ['Mistake'], config.mistakes);
  count('Quiz', ['Question'], config.quizQuestions);
  const activities = blocks.filter(
    (node) =>
      node.name === 'Interactive' || node.name === 'InteractiveFallback',
  );
  if (activities.length < config.interactives)
    fail(offset + 1, `Нужно не менее ${config.interactives} интерактива.`);
  const references = [];
  for (const node of activities) {
    const id = attribute(node, 'id');
    const line = offset + (node.position?.start.line ?? 1);
    if (typeof id !== 'string' || !id.trim())
      fail(line, 'У интерактива нужен строковый id.');
    else
      references.push({
        id,
        fallback: node.name === 'InteractiveFallback',
        file,
        line,
      });
    if (
      node.name === 'InteractiveFallback' &&
      !descendants(node, ['Figure', 'svg']).length
    )
      fail(line, 'Временная замена должна содержать настоящую визуализацию.');
  }
  for (const name of [
    'Motivation',
    'Theory',
    'Examples',
    'Mistakes',
    'Quiz',
    'CheatSheet',
  ]) {
    const block = blocks.find((node) => node.name === name);
    if (
      block &&
      !block.children?.some((node) => node.type !== 'text' || node.value.trim())
    )
      fail(offset + (block.position?.start.line ?? 1), `Пустой блок ${name}.`);
  }
  return {
    data: metadata.success ? metadata.data : undefined,
    references,
    counts,
    findings,
  };
}
