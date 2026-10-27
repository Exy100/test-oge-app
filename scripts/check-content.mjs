import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { filesIn } from './quality/files.mjs';
import {
  createProseAudit,
  inspectHtml,
  markdownProse,
  sourceProse,
} from './quality/content.mjs';

const root = process.cwd();
const output = resolve(root, '.cache/content-audit');
let server;
try {
  const glossary = JSON.parse(
    await readFile(
      resolve(root, 'scripts/quality/content-glossary.json'),
      'utf8',
    ),
  );
  const audit = createProseAudit(glossary);
  const findings = [];
  const formulas = new Map();
  const counts = {
    html: 0,
    source: 0,
    generators: 0,
    bank: 0,
    tasks: 0,
    formulas: 0,
  };
  function html(source, location) {
    const inspected = inspectHtml(source);
    counts.formulas += inspected.formulas;
    for (const formula of inspected.formulaSources) {
      const locations = formulas.get(formula) ?? new Set();
      locations.add(location);
      formulas.set(formula, locations);
    }
    for (const error of inspected.errors)
      findings.push({ rule: 'formula', location, message: error });
    for (const text of inspected.text) audit.check(text, location);
  }
  const built = (await filesIn(root, 'dist')).filter((file) =>
    file.endsWith('.html'),
  );
  if (!built.length)
    throw new Error('Нет HTML сборки. Сначала выполни npm run build.');
  for (const file of built) {
    html(await readFile(resolve(root, file), 'utf8'), file);
    counts.html++;
  }
  for (const file of await filesIn(root, 'src')) {
    if (
      !/\.(?:ts|tsx|astro)$/u.test(file) ||
      /(?:\.test\.|\/dev\/|\/__snapshots__\/)/u.test(file)
    )
      continue;
    const source = await readFile(resolve(root, file), 'utf8');
    const fragments = file.endsWith('.astro')
      ? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)].flatMap(
          (match) => sourceProse(file + '.ts', match[1]),
        )
      : sourceProse(file, source);
    for (const fragment of fragments)
      for (const text of markdownProse(fragment.text))
        audit.check(text, `${file}:${String(fragment.line)}`);
    counts.source++;
  }
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  const { generators } = await server.ssrLoadModule(
    '/src/core/generators/index.ts',
  );
  const { bankTasks } = await server.ssrLoadModule('/src/core/banks/index.ts');
  const { renderRichText } = await server.ssrLoadModule(
    '/src/core/rich-text/render.ts',
  );
  const { describeFigure } = await server.ssrLoadModule(
    '/src/core/figures/describe.ts',
  );
  const samples = [];
  for (const generator of generators) {
    counts.generators++;
    for (let index = 0; index < 10; index++)
      samples.push(
        generator.generate(`content-audit-20261027:${String(index)}`),
      );
  }
  samples.push(...bankTasks);
  counts.bank = bankTasks.length;
  for (const task of samples) {
    counts.tasks++;
    const fields = [
      task.statement,
      ...task.hints,
      ...task.solution.flatMap((step) => [
        step.text,
        ...(step.formula ? [`$$${step.formula}$$`] : []),
      ]),
      ...task.commonMistakes.map((item) => item.explanation),
      ...(task.criteria?.levels.map((level) => level.description) ?? []),
      ...(task.figure ? [describeFigure(task.figure)] : []),
    ];
    for (const [index, field] of fields.entries())
      html(renderRichText(field), `${task.id}:text-${String(index)}`);
  }
  const prose = audit.report();
  const report = {
    counts,
    ...prose,
    formulas: [...formulas].map(([source, locations]) => ({
      source,
      locations: [...locations],
    })),
    findings: [...findings, ...prose.findings],
  };
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await writeFile(
    resolve(output, 'samples.json'),
    JSON.stringify(samples, null, 2) + '\n',
  );
  const review = samples
    .map(
      (task) =>
        `## №${String(task.taskNumber)} · ${task.generatorId} · ${task.seed}\n\n${task.statement}\n\n### Подсказки\n\n${task.hints.map((hint, index) => `${String(index + 1)}. ${hint}`).join('\n')}\n\n### Разбор\n\n${task.solution.map((step, index) => `${String(index + 1)}. ${step.text}`).join('\n\n')}\n\nОтвет: ${task.answer.type === 'artifact' ? task.answer.referenceId : task.answer.value}.`,
    )
    .join('\n\n');
  await writeFile(
    resolve(output, 'samples.md'),
    '# Детерминированные образцы для редакторского аудита\n\n' + review + '\n',
  );
  for (const item of report.findings.slice(0, 35))
    console.error(JSON.stringify(item));
  console.log(
    `Content: ${String(counts.html)} HTML; ${String(counts.source)} sources; ${String(counts.generators)} generators; ${String(counts.bank)} curated tasks; ${String(counts.tasks)} samples; ${String(counts.formulas)} formulas; ${String(report.words)} words; ${String(report.findings.length)} findings.`,
  );
  if (report.findings.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
