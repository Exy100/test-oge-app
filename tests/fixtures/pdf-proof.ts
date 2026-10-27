import { expect, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

const exec = promisify(execFile);
const bounds = z.object({
  html: z.object({
    body: z.object({
      doc: z.object({
        page: z
          .array(
            z.object({
              width: z.number(),
              height: z.number(),
              word: z
                .array(
                  z.object({
                    xMin: z.number(),
                    xMax: z.number(),
                    yMin: z.number(),
                    yMax: z.number(),
                  }),
                )
                .min(1),
            }),
          )
          .min(1),
      }),
    }),
  }),
});

export function compact(text: string) {
  return text.normalize('NFKC').replace(/[\s\u00ad]+/gu, '');
}

/** Check the exported pages and text, not just CSS computed in a viewport. */
export async function provePdf(page: Page, content: Locator, name: string) {
  const directory = '.cache/print-pdf';
  await mkdir(directory, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const chunks = await content.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const result: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('math, script, style, .ui-sr-only'))
        continue;
      if (
        !parent.getClientRects().length ||
        getComputedStyle(parent).visibility !== 'visible'
      )
        continue;
      const text = node.textContent?.trim();
      if (text) result.push(text);
    }
    return result;
  });
  expect(chunks.length).toBeGreaterThan(0);
  const path = join(directory, `${name}.pdf`);
  await page.pdf({
    path,
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const [raw, bbox] = await Promise.all([
    exec('pdftotext', ['-raw', path, '-'], { maxBuffer: 4 * 1024 * 1024 }),
    exec('pdftotext', ['-bbox', path, '-'], { maxBuffer: 8 * 1024 * 1024 }),
  ]);
  const text = compact(raw.stdout);
  for (const chunk of chunks)
    expect(
      text.includes(compact(chunk)),
      `Missing printed text in ${name}: ${chunk}`,
    ).toBe(true);
  const parsed = bounds.parse(
    new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      isArray: (tag) => tag === 'page' || tag === 'word',
    }).parse(bbox.stdout),
  );
  const pages = parsed.html.body.doc.page;
  const inset = (15 * 72) / 25.4 - 1;
  for (const [index, sheet] of pages.entries()) {
    expect(
      Math.abs(sheet.width - 595.28),
      `${name}, page ${String(index + 1)}: A4 width`,
    ).toBeLessThan(1);
    expect(
      Math.abs(sheet.height - 841.89),
      `${name}, page ${String(index + 1)}: A4 height`,
    ).toBeLessThan(1);
    for (const word of sheet.word) {
      expect(
        word.xMin,
        `${name}, page ${String(index + 1)}: left clipping`,
      ).toBeGreaterThanOrEqual(inset);
      expect(
        word.xMax,
        `${name}, page ${String(index + 1)}: right clipping`,
      ).toBeLessThanOrEqual(sheet.width - inset);
      expect(
        word.yMin,
        `${name}, page ${String(index + 1)}: top clipping`,
      ).toBeGreaterThanOrEqual(inset);
      expect(
        word.yMax,
        `${name}, page ${String(index + 1)}: bottom clipping`,
      ).toBeLessThanOrEqual(sheet.height - inset);
    }
  }
  if (
    /^(?:program-tracing|logic-operations|sheet-references)-|^result-/u.test(
      name,
    )
  ) {
    await exec('pdftoppm', [
      '-png',
      '-scale-to',
      '1600',
      '-f',
      '1',
      '-singlefile',
      path,
      join(directory, `${name}-first`),
    ]);
    if (pages.length > 1)
      await exec('pdftoppm', [
        '-png',
        '-scale-to',
        '1600',
        '-f',
        String(pages.length),
        '-singlefile',
        path,
        join(directory, `${name}-last`),
      ]);
  }
  return { text, pages: pages.length, path };
}
