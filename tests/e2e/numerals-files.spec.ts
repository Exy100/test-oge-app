import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { lessonTask } from '../../src/lib/lessons/content';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { confirmedFileSources } from '../../src/core/generators/exam/file-generators';
import {
  readingOracle,
  selectionOracle,
} from '../fixtures/exam/solve-generated-files';
import { trainingFiles } from '../../src/lib/interactives/training-files';
import { readZip } from '../../src/core/datasets/zip';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const fileLessons = preparationLessons.filter((lesson) =>
  ['i9', 'i10'].includes(lesson.section),
);
async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}

test('digits, decomposition, reverse conversion and exam sum work from the keyboard', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i9/positional-notation/',
    'numeral-lab',
  );
  const raw = scene.getByLabel('Исходная запись числа');
  await raw.fill('102');
  await expect(scene.getByRole('alert')).toContainText('меньше основания');
  await raw.fill('1011');
  await expect(scene).toContainText(
    'В десятичной системе: 11. В основании 16: B.',
  );
  await scene.getByLabel('Основание исходной записи').selectOption('16');
  await raw.fill('FF');
  await scene.getByLabel('Основание результата').selectOption('2');
  await expect(scene).toContainText(
    'В десятичной системе: 255. В основании 2: 11111111.',
  );
  await scene.getByText('Деление с остатком:', { exact: false }).press('Enter');
  await expect(scene).toContainText('255 : 2 = 127, остаток 1');
  await scene.getByLabel('Сумма в десятичной системе').fill('51');
  await scene.getByRole('button', { name: 'Проверить сумму' }).press('Enter');
  await expect(scene).toContainText('Пока неверно');
  await scene.getByLabel('Сумма в десятичной системе').fill('52');
  const check = scene.getByRole('button', { name: 'Проверить сумму' });
  if (info.project.use.hasTouch === true) await check.tap();
  else await check.press('Enter');
  await expect(scene).toContainText('Верно: сумма найдена');
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(raw).toHaveValue('FF');
  await raw.fill('0000000000000001');
  await expect(
    scene.getByRole('cell', { name: '1152921504606846976', exact: true }),
  ).toBeVisible();
  await expect(scene).toContainText('В десятичной системе: 1.');
  await scene.getByLabel('Двоичное слагаемое').fill('2');
  await expect(
    scene.getByRole('button', { name: 'Проверить сумму' }),
  ).toBeDisabled();
});
test('comparison uses values rather than lengths or leading zeroes', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i9/compare-numerals/',
    'numeral-lab',
  );
  await expect(scene).toContainText('255 = 255: сравнили десятичные значения.');
  await scene.getByLabel('Вторая запись для сравнения').fill('0001');
  await expect(scene).toContainText('255 > 1: сравнили десятичные значения.');
  await scene.getByLabel('Исходная запись числа').fill('0');
  await expect(scene).toContainText('0 < 1: сравнили десятичные значения.');
});
test('tree navigation distinguishes nested files, same names and neighbouring folders', async ({
  page,
}, info) => {
  const scene = await openScene(
    page,
    'materials/i10/directories/',
    'file-tree',
  );
  const summary = scene.locator('.lab-file-tree summary').first();
  await summary.focus();
  await summary.press('Enter');
  await summary.press('Enter');
  await scene.getByLabel('Сколько файлов в выбранной области?').fill('2');
  await scene.getByRole('button', { name: 'Проверить область' }).press('Enter');
  await expect(scene).toContainText('Верно. Файлов в области: 2.');
  const recursive = scene.getByRole('checkbox', {
    name: 'Учитывать вложенные папки',
  });
  if (info.project.use.hasTouch === true) await recursive.tap();
  else await recursive.press('Space');
  await scene.getByRole('button', { name: 'Проверить область' }).press('Enter');
  await expect(scene).toContainText('Пока неверно');
  await scene.getByLabel('Сколько файлов в выбранной области?').fill('3');
  await scene.getByRole('button', { name: 'Проверить область' }).press('Enter');
  await expect(scene).toContainText('Верно. Файлов в области: 3.');
  await scene.getByLabel('Каталог поиска').selectOption('');
  await scene
    .getByLabel('Сколько файлов в выбранной области?')
    .fill(String(trainingFiles.length));
  await scene.getByRole('button', { name: 'Проверить область' }).press('Enter');
  await expect(scene).toContainText('Верно. Файлов в области: 9.');
});
test('text search exposes distracting contexts, whole words and safe literal queries', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i10/search-file-text/',
    'text-file-search',
  );
  await expect(scene).toContainText('Найдено файлов: 2; совпадений: 2.');
  await expect(scene.locator('mark')).toHaveCount(2);
  await expect(scene).toContainText('лодочника Орлова');
  await scene.getByLabel('Фамилия по контексту').fill('Серов');
  await scene
    .getByRole('button', { name: 'Проверить контекст' })
    .press('Enter');
  await expect(scene).toContainText('Пока неверно');
  await scene.getByLabel('Фамилия по контексту').fill('  ОРЛОВ  ');
  await scene
    .getByRole('button', { name: 'Проверить контекст' })
    .press('Enter');
  await expect(scene).toContainText('Верно: Орлов');
  await scene.getByLabel('Каталог поиска').selectOption('');
  const query = scene.getByLabel('Текст для поиска внутри файлов');
  await query.fill('МАЯК');
  await expect(scene).toContainText('совпадений: 6.');
  await scene
    .getByRole('checkbox', { name: 'Только целое слово или фраза' })
    .check();
  await expect(scene).toContainText('совпадений: 4.');
  await query.fill('.*');
  await expect(scene).toContainText('Найдено файлов: 0; совпадений: 0.');
  await query.fill('');
  await expect(scene.getByRole('alert')).toBeVisible();
});
test('masks use exact names, optional descendants and actual UTF-8 bytes', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i10/file-masks-size/',
    'file-masks',
  );
  await expect(scene).toContainText('Файлов: 2.');
  const files = trainingFiles.filter((file) =>
    ['Данные/note_a.txt', 'Данные/old/note_b.txt'].includes(file.path),
  );
  const bytes = Buffer.byteLength(
    files.map((file) => file.text).join(''),
    'utf8',
  );
  await scene.getByLabel('Суммарный размер в байтах').fill(String(bytes));
  await scene.getByRole('button', { name: 'Проверить объём' }).press('Enter');
  await expect(scene).toContainText('Верно: сложены размеры');
  await scene
    .getByRole('checkbox', { name: 'Учитывать вложенные папки' })
    .uncheck();
  await expect(scene).toContainText('Файлов: 1.');
  const mask = scene.getByLabel('Маска имени файла');
  await mask.fill('note_*.txt');
  await expect(scene).toContainText('Файлов: 2.');
  await mask.fill('NOTE_?.TXT');
  await expect(scene).toContainText('Файлов: 1.');
  await mask.fill('*.pdf');
  await expect(scene).toContainText('Файлов: 0. Объём: 0 байт; 0 КиБ');
  await scene.getByLabel('Суммарный размер в байтах').fill('0');
  await scene.getByRole('button', { name: 'Проверить объём' }).press('Enter');
  await expect(scene).toContainText('Верно: сложены размеры');
  await mask.fill('Данные/*.txt');
  await expect(scene.getByRole('alert')).toBeVisible();
});
test('ZIP downloads contain the actual training texts and independently solve exam file questions', async ({
  page,
  request,
}) => {
  for (const [name, number, id] of [
    ['training', 0, ''],
    ['reading', 11, 'context-reading-v2'],
    ['selection', 12, 'file-extensions-v2'],
  ] as const) {
    const response = await request.get('materials/files/' + name + '.zip');
    expect(response.ok()).toBe(true);
    const files = readZip(await response.body());
    if (name === 'training') {
      for (const file of trainingFiles)
        expect(Buffer.from(files.get(file.path) ?? []).toString('utf8')).toBe(
          file.text,
        );
    } else {
      const task = lessonTask({
        generatorId: id,
        taskNumber: number,
        seed: 'download-proof',
      }).task;
      expect(task.answer).toMatchObject({
        value:
          number === 11
            ? readingOracle(task, files)
            : selectionOracle(task, files),
      });
    }
  }
  await page.goto('materials/i10/search-file-text/');
  await page
    .getByRole('link', {
      name: 'Скачать файлы к вопросу: Вопрос 5. Формат ОГЭ №11 (ZIP)',
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  const download = page.waitForEvent('download');
  await page
    .getByRole('link', {
      name: 'Скачать файлы к вопросу: Вопрос 5. Формат ОГЭ №11 (ZIP)',
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe('reading.zip');
});
test('scene modules load only when visible and load only the selected module', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/(?:NumeralLab|FileTree|TextFileSearch|FileMasks)\.[^/]+\.js/u.test(
        request.url(),
      )
    )
      requests.push(request.url());
  });
  await page.goto('materials/i9/base-conversion/');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(0);
  await page.locator('#numeral-lab').scrollIntoViewIfNeeded();
  await expect(page.locator('#numeral-lab .information-lab')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain('/NumeralLab.');
});
for (const lesson of fileLessons) {
  test(`${lesson.id}: complete lesson, generated quiz, contents, practice and keyboard example`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(lesson.route.slice(1));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      lesson.title,
    );
    await expect(page.locator('#theory svg')).toHaveCount(2);
    expect(
      await page.locator('#theory svg').evaluateAll((figures) =>
        figures.every((figure) => {
          const texts = Array.from(figure.querySelectorAll('text'));
          return (
            texts.length > 0 &&
            texts.every(
              (text) =>
                text.namespaceURI === 'http://www.w3.org/2000/svg' &&
                text.textContent.trim() &&
                text.children.length === 0,
            )
          );
        }),
      ),
    ).toBe(true);
    await expect(page.locator('.lesson-example')).toHaveCount(3);
    await expect(page.locator('.lesson-question')).toHaveCount(5);
    const toc = page.getByRole('navigation', { name: 'Содержание урока' });
    for (const link of await toc.getByRole('link').all()) {
      const href = await link.getAttribute('href');
      if (!href) throw new Error('Нет адреса оглавления.');
      await expect(page.locator(href)).toHaveCount(1);
    }
    const example = page.locator('#example-1');
    await example.locator('[data-lesson-example] > summary').focus();
    await example.locator('[data-lesson-example] > summary').press('Enter');
    const next = example.getByRole('button', { name: 'Следующий шаг' });
    await next.focus();
    await next.press('Enter');
    await expect(example.locator('.lesson-steps > li').nth(1)).toBeFocused();
    const question = page.locator('#question-1');
    await question.scrollIntoViewIfNeeded();
    await expect(
      question.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await question.getByRole('radio').first().focus();
    await question.getByRole('radio').first().press('Space');
    await question
      .getByRole('button', { name: 'Проверить ответ' })
      .press('Enter');
    await expect(question.locator('.lesson-feedback')).toHaveAttribute(
      'data-verdict',
      'correct',
    );
    const file = await readFile(
      `src/content/lessons/${lesson.section}/${lesson.id}.mdx`,
      'utf8',
    );
    const match = Array.from(
      file.matchAll(
        /generatorId: '([^']+)',\s*taskNumber: (10|11|12),\s*seed: '([^']+)'/gu,
      ),
    ).at(-1);
    if (!match?.[1] || !match[2] || !match[3])
      throw new Error('Нет источника последнего вопроса.');
    const source = {
      generatorId: match[1],
      taskNumber: Number(match[2]) as 10 | 11 | 12,
      seed: match[3],
    };
    const task = lessonTask(source).task;
    const answer =
      task.taskNumber === 10
        ? solveParameters(parseGeneratedProblem(task))?.[0]
        : task.taskNumber === 11
          ? readingOracle(
              task,
              new Map(
                confirmedFileSources(task).map(({ path, bytes }) => [
                  path,
                  bytes,
                ]),
              ),
            )
          : selectionOracle(
              task,
              new Map(
                confirmedFileSources(task).map(({ path, bytes }) => [
                  path,
                  bytes,
                ]),
              ),
            );
    if (!answer) throw new Error('Нет независимого ответа.');
    const exam = page.locator('#question-5');
    await exam.scrollIntoViewIfNeeded();
    await expect(
      exam.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await exam.getByLabel('Твой ответ').fill(answer);
    await exam.getByLabel('Твой ответ').press('Enter');
    await expect(exam.locator('.lesson-feedback')).toHaveAttribute(
      'data-verdict',
      'correct',
    );
    const href = await page
      .getByRole('link', { name: 'Перейти к заданиям' })
      .getAttribute('href');
    if (!href) throw new Error('Нет ссылки практики.');
    expect(new URL(href, page.url()).searchParams.get('numbers')).toBe(
      lesson.id === 'directories' ? '11,12' : String(lesson.taskNumber),
    );
    expect(errors).toEqual([]);
  });
}

for (const [title, module] of [
  ['Разряды чисел', 'NumeralLab'],
  ['Дерево файлов', 'FileTree'],
  ['Поиск текста', 'TextFileSearch'],
  ['Маски файлов', 'FileMasks'],
] as const) {
  test(`${module}: twenty real mount/unmount cycles release native resources`, async ({
    page,
  }) => {
    await page.addInitScript(installInteractiveAudit);
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
    await page.locator('#bits-probe').scrollIntoViewIfNeeded();
    await expect(page.locator('#bits-probe [data-probe-ready]')).toBeVisible();
    await page
      .locator('#bits-probe')
      .getByRole('button', { name: 'Пауза', exact: true })
      .click();
    const harness = page.getByRole('region', {
      name: 'Повторное подключение и ошибки',
    });
    await harness.scrollIntoViewIfNeeded();
    await expect(harness.getByLabel('Модуль для проверки')).toBeEnabled();
    await harness
      .getByLabel('Модуль для проверки')
      .selectOption({ label: title });
    await expect(page.locator('#bits-probe .interactive-host')).toHaveAttribute(
      'data-interactive-active',
      'false',
    );
    await expect
      .poll(() => page.evaluate(() => window.interactiveResources().frames))
      .toBe(0);
    const baseline = await page.evaluate(() => window.interactiveResources());
    for (let cycle = 0; cycle < 20; cycle++) {
      await harness
        .getByRole('button', { name: 'Подключить сцену', exact: true })
        .click();
      await expect(harness.locator('.information-lab')).toBeVisible();
      const mounted = await page.evaluate(() => window.interactiveResources());
      expect(mounted.intersections).toBe(baseline.intersections + 1);
      expect(mounted.mutations).toBe(baseline.mutations + 1);
      expect(mounted.intervals).toBe(0);
      expect(mounted.frames).toBe(0);
      await harness
        .getByRole('button', { name: 'Отключить сцену', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.interactiveResources()))
        .toEqual(baseline);
    }
  });
}

test('each 2D entry including all its imported JavaScript stays below 80 KB gzip', async () => {
  const files = await readdir('dist/_astro');
  async function moduleBytes(file: string, seen: Set<string>): Promise<number> {
    if (seen.has(file)) return 0;
    seen.add(file);
    const source = await readFile(join('dist/_astro', file), 'utf8');
    let bytes = gzipSync(source).length;
    for (const [, imported] of source.matchAll(
      /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/gu,
    )) {
      if (!imported) throw new Error('Не найден импорт.');
      bytes += await moduleBytes(imported.slice(2), seen);
    }
    return bytes;
  }
  for (const name of [
    'NumeralLab',
    'FileTree',
    'TextFileSearch',
    'FileMasks',
  ]) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  for (const lesson of fileLessons)
    test(`${theme}: ${lesson.id} is accessible at 360 px without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.addInitScript((theme) => {
        localStorage.setItem(
          'oge:informatics:v1:settings',
          JSON.stringify({
            version: 1,
            theme,
            fontSize: 100,
            animations: false,
          }),
        );
      }, theme);
      await page.goto(lesson.route.slice(1));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const scene = page.locator('.lesson-interactive');
      await scene.scrollIntoViewIfNeeded();
      await expect(scene.locator('.information-lab')).toBeVisible();
      // Check the full rendered document, including all examples and quiz controls.
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const table of await scene.locator('.lab-table-scroll').all()) {
        await table.focus();
        await expect(table).toBeFocused();
        if (
          await table.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          )
        ) {
          await table.press('ArrowRight');
          await expect
            .poll(() => table.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        }
      }
      expect(
        await page
          .locator('#theory svg text, .information-lab svg text')
          .evaluateAll((labels) =>
            labels.every((element) => {
              if (!(element instanceof SVGTextElement)) return false;
              const bounds = element.getBBox(),
                frame = element.ownerSVGElement?.viewBox.baseVal;
              return (
                frame !== undefined &&
                bounds.width > 0 &&
                bounds.y >= 0 &&
                bounds.x >= 0 &&
                bounds.x + bounds.width <= frame.width &&
                bounds.y + bounds.height <= frame.height
              );
            }),
          ),
      ).toBe(true);
    });
}

test('all lessons retain theory, solved examples and scene alternatives without JavaScript and in print', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  for (const lesson of fileLessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternative = page.locator('.interactive-alternative');
    await alternative.locator('summary').click();
    await expect(alternative.locator('div')).toBeVisible();
    await page.locator('#example-1 [data-lesson-example] > summary').click();
    await expect(page.locator('#example-1 .lesson-steps > li')).toHaveCount(3);
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.locator('#example-1 .lesson-steps > li').last(),
    ).toBeVisible();
    await expect(page.locator('.interactive-screen')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  }
  await context.close();
});

test('production scene screenshots at mobile and desktop widths', async ({
  page,
}, info) => {
  await mkdir('.cache/t7-9-screens', { recursive: true });
  for (const [route, id] of [
    ['materials/i9/base-conversion/', 'numeral-lab'],
    ['materials/i10/directories/', 'file-tree'],
    ['materials/i10/search-file-text/', 'text-file-search'],
    ['materials/i10/file-masks-size/', 'file-masks'],
  ]) {
    if (!route || !id) throw new Error('Нет сцены.');
    const scene = await openScene(page, route, id);
    await scene.screenshot({
      path: `.cache/t7-9-screens/${id}-${info.project.name}.png`,
    });
    await page
      .locator('#theory svg')
      .first()
      .screenshot({
        path: `.cache/t7-9-screens/${id}-theory-${info.project.name}.png`,
      });
  }
});
