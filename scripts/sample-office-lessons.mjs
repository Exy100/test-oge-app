import { createServer } from 'vite';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('.cache/office-lessons');
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const [
    { exportDocument, exportSheet },
    { exportSlides },
    { documentTarget, documentSet },
    { slideTarget },
    { labRows },
  ] = await Promise.all([
    server.ssrLoadModule('/src/lib/interactives/office-export.ts'),
    server.ssrLoadModule('/src/lib/interactives/office-slide-export.ts'),
    server.ssrLoadModule('/src/lib/interactives/document-format.ts'),
    server.ssrLoadModule('/src/lib/interactives/slide-layout.ts'),
    server.ssrLoadModule('/src/lib/interactives/spreadsheet.ts'),
  ]);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const documents = [],
    slides = [];
  for (const id of ['D01', 'D02', 'D03']) {
    const set = documentSet(id);
    await writeFile(
      resolve(output, id + '.odt'),
      exportDocument(id, documentTarget(id)),
    );
    documents.push({
      id,
      text: [
        set.title,
        ...set.paragraphs,
        ...set.headers,
        ...set.rows.flat(),
        ...(set.family === 'sections' ? [set.sectionTitle] : []),
      ],
    });
  }
  for (const id of ['P01', 'P02', 'P11']) {
    const target = slideTarget(id);
    await writeFile(resolve(output, id + '.odp'), exportSlides(id, target));
    slides.push({
      id,
      text: target.slides.map((slide) =>
        slide.frames
          .filter((frame) => frame.kind === 'text')
          .flatMap((frame) => frame.paragraphs),
      ),
    });
  }
  const cases = [
    { id: 'sum', formula: '=СУММ(D2:D13)' },
    { id: 'count', formula: '=COUNTIFS($C$2:$C$13;7;$D$2:$D$13;">200")' },
    { id: 'selected-sum', formula: '=SUMIF(B2:B13;1;D2:D13)' },
  ];
  for (const item of cases)
    await writeFile(
      resolve(output, item.id + '.ods'),
      exportSheet({
        first: item.formula,
        second: '=AVERAGEIF(B2:B13;1;D2:D13)',
        chartRows: labRows.slice(1),
        legend: true,
        labels: true,
      }),
    );
  await writeFile(
    resolve(output, 'checks.json'),
    JSON.stringify({ documents, slides, cases, rows: labRows }, null, 2) + '\n',
  );
  console.log(
    'Office lesson exports: .cache/office-lessons (3 ODT, 3 ODP, 3 ODS)',
  );
} finally {
  await server.close();
}
