import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { officeSources, officeArchiveHref } from '../../src/lib/lessons/office';
import { resolveStreamTask } from '../../src/core/stream/catalog';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { validateOdf } from '../../src/core/datasets/odf';
import { readZip } from '../../src/core/datasets/zip';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
declare global {
  interface Window {
    officeUrls: () => number;
  }
}
const officeLessons = preparationLessons.filter((lesson) =>
  ['i11', 'i12'].includes(lesson.section),
);
async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}

test('document properties change preview, keyboard feedback and the actual ODT', async ({
  page,
}, info) => {
  const scene = await openScene(
    page,
    'materials/i11/document-paragraphs/',
    'document-format',
  );
  await scene
    .getByRole('button', { name: 'Проверить свойства' })
    .press('Enter');
  await expect(scene).toContainText('Исправь: Размер шрифта');
  for (const [label, value] of [
    ['Размер шрифта, пт', '14'],
    ['Первая строка, см', '1'],
    ['Межстрочный интервал, %', '115'],
    ['После абзаца, пт', '14'],
  ]) {
    if (!label || !value) throw new Error('Нет свойства.');
    const input = scene.getByRole('spinbutton', { name: label, exact: true });
    await input.press('ControlOrMeta+A');
    await input.pressSequentially(value);
  }
  await scene
    .getByLabel('Выравнивание заголовка', { exact: true })
    .selectOption('center');
  await scene
    .getByLabel('Выравнивание основного текста', { exact: true })
    .selectOption('justify');
  for (const label of [
    'Полужирное слово в абзаце 1',
    'Курсив слова в абзаце 2',
    'Подчёркивание слова в абзаце 2',
  ])
    await scene.getByRole('checkbox', { name: label, exact: true }).check();
  await scene
    .getByRole('button', { name: 'Проверить свойства' })
    .press('Enter');
  await expect(scene).toContainText('Верно: учебные свойства совпали');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    scene.getByRole('button', { name: 'Скачать текущий ODT' }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Нет файла.');
  const files = validateOdf(await readFile(path), 'odt'),
    xml = new TextDecoder().decode(files.get('content.xml'));
  expect(xml).toContain('fo:font-size="14pt"');
  expect(xml).toContain('fo:text-indent="1cm"');
  expect(xml).toContain('fo:font-weight="bold"');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(
    scene.getByRole('spinbutton', { name: 'Размер шрифта, пт', exact: true }),
  ).toHaveValue('14');
  const reset = scene.getByRole('button', {
    name: 'Вернуть начальные свойства',
  });
  if (info.project.name === 'mobile') await reset.tap();
  else await reset.press('Enter');
  await expect(
    scene.getByRole('spinbutton', { name: 'Размер шрифта, пт', exact: true }),
  ).toHaveValue('12');
});
test('true merged rows and independent table properties are corrected', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i11/document-tables/',
    'document-format',
  );
  await expect(scene.locator('.office-document th[colspan="2"]')).toHaveCount(
    0,
  );
  await scene
    .getByRole('checkbox', {
      name: 'Объединить строки заголовков',
      exact: true,
    })
    .check();
  await scene
    .getByRole('spinbutton', { name: 'Столбец 1, см', exact: true })
    .fill('7');
  for (const name of ['Таблица по центру', 'Ячейки по вертикали по центру'])
    await scene.getByRole('checkbox', { name, exact: true }).check();
  await expect(scene.locator('.office-document th[colspan="2"]')).toHaveCount(
    2,
  );
  await scene
    .getByRole('button', { name: 'Проверить свойства' })
    .press('Enter');
  await expect(scene).toContainText('Верно: учебные свойства совпали');
  await scene.getByLabel('Набор документа').selectOption('D02');
  await expect(scene).toContainText('Заголовки двух столбцов не объединены.');
});
test('slide coordinates, preserved proportions, font sizes and real ODP images work', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i11/presentation-layout/',
    'slide-layout',
  );
  await scene
    .getByRole('button', { name: 'Проверить компоновку' })
    .press('Enter');
  await expect(scene).toContainText('нарушены пропорции');
  await scene
    .getByRole('button', { name: 'Вернуть выбранный объект по макету' })
    .press('Enter');
  await scene
    .getByRole('spinbutton', {
      name: 'Размер основного текста, пт',
      exact: true,
    })
    .fill('20');
  await scene
    .getByRole('button', { name: 'Вправо', exact: true })
    .press('Enter');
  await scene
    .getByRole('button', { name: 'Проверить компоновку' })
    .press('Enter');
  await expect(scene).toContainText('Верно: взаимное расположение');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    scene.getByRole('button', { name: 'Скачать текущий ODP' }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Нет файла.');
  const files = validateOdf(await readFile(path), 'odp');
  expect(
    [...files.keys()].filter((path) => path.endsWith('.png')),
  ).toHaveLength(3);
  const content = new TextDecoder().decode(files.get('content.xml'));
  const secondSlide = content.split('<draw:page ')[2] ?? '';
  const imageFrame = [
    ...secondSlide.matchAll(/<draw:frame[^>]+>[\s\S]*?<\/draw:frame>/gu),
  ].find((match) => match[0].includes('<draw:image'));
  expect(imageFrame?.[0]).toContain('svg:x="1.2cm"');
  await scene
    .getByRole('checkbox', {
      name: 'Сохранять пропорции при изменении размера изображения',
    })
    .uncheck();
  await scene
    .getByRole('spinbutton', { name: 'Высота, см', exact: true })
    .fill('2');
  await scene
    .getByRole('button', { name: 'Проверить компоновку' })
    .press('Enter');
  await expect(scene).toContainText('нарушены пропорции');
});
test('spreadsheet uses real formulas, strict filters, anchored copying and uncached editable output', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i12/sheet-references/',
    'spreadsheet-lab',
  );
  await expect(scene).toContainText('После копирования: =$D3+E$2+$D$2');
  await scene
    .getByLabel('Формула для копирования')
    .fill('=COUNTIF(A1:A4;"A1")');
  await expect(scene).toContainText('=COUNTIF(B2:B5;"A1")');
  await scene.getByLabel('Формула первого расчёта').fill('=СУММ(D2:D13)');
  await scene
    .getByRole('button', { name: 'Проверить расчёты и диаграмму' })
    .press('Enter');
  await expect(scene).toContainText('Верно: учебные значения');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    scene.getByRole('button', { name: 'Скачать текущий ODS' }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Нет файла.');
  const files = validateOdf(await readFile(path), 'ods');
  expect(new TextDecoder().decode(files.get('content.xml'))).toContain(
    'table:formula="of:=SUM([.D2:.D13])"',
  );
  expect(files.has('Object1/content.xml')).toBe(true);
  await scene.getByLabel('Формула первого расчёта').fill('=1/0');
  await expect(scene.getByRole('alert')).toBeVisible();
  await expect(
    scene.getByRole('button', { name: 'Скачать текущий ODS' }),
  ).toBeDisabled();
});
test('chart scope, legends, values and the empty selection affect the actual diagram', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i12/sheet-charts/',
    'spreadsheet-lab',
  );
  await scene
    .getByRole('button', { name: 'Проверить расчёты и диаграмму' })
    .press('Enter');
  await expect(scene).toContainText('Проверь результаты');
  await scene.getByLabel('Источник диаграммы').selectOption('all');
  await scene.getByRole('checkbox', { name: 'Легенда на диаграмме' }).check();
  await scene
    .getByRole('checkbox', { name: 'Числовые подписи секторов' })
    .check();
  await scene
    .getByRole('button', { name: 'Проверить расчёты и диаграмму' })
    .press('Enter');
  await expect(scene).toContainText('Верно: учебные значения');
  await expect(scene.locator('figure svg path[fill]')).toHaveCount(3);
  await scene.getByLabel('Источник диаграммы').selectOption('selected');
  await scene
    .getByRole('spinbutton', { name: 'Баллы строго больше', exact: true })
    .fill('400');
  await expect(scene).toContainText('Выбрано строк: 0');
  await expect(scene).toContainText('Нет данных для круговой диаграммы');
});
test('static office ZIP downloads contain exact verified source and editable reference files', async ({
  request,
}) => {
  for (const source of officeSources) {
    const href = officeArchiveHref(source);
    if (!href) throw new Error('Нет архива.');
    const response = await request.get(href);
    expect(response.ok()).toBe(true);
    const actual = readZip(await response.body()),
      expected = await createTaskDataset(resolveStreamTask(source));
    expect(actual.size).toBe(expected.files.size);
    for (const [path, bytes] of expected.files)
      expect(
        Buffer.from(actual.get(path) ?? []).equals(Buffer.from(bytes)),
      ).toBe(true);
  }
});
test('each repeated download replaces its object URL and unmount releases it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const urls = new Set<string>(),
      create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      urls.delete(url);
      revoke(url);
    };
    Object.defineProperty(window, 'officeUrls', { value: () => urls.size });
  });
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
  const harness = page.getByRole('region', {
    name: 'Повторное подключение и ошибки',
  });
  await harness.scrollIntoViewIfNeeded();
  await harness
    .getByLabel('Модуль для проверки')
    .selectOption({ label: 'Форматирование документа' });
  await harness
    .getByRole('button', { name: 'Подключить сцену', exact: true })
    .click();
  await expect(harness.locator('.information-lab')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const download = page.waitForEvent('download');
    await harness.getByRole('button', { name: 'Скачать текущий ODT' }).click();
    await download;
    expect(await page.evaluate(() => window.officeUrls())).toBe(1);
  }
  await harness
    .getByRole('button', { name: 'Отключить сцену', exact: true })
    .click();
  expect(await page.evaluate(() => window.officeUrls())).toBe(0);
});
test('office scenes and export code remain lazy until their controls are used', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/(?:DocumentFormat|SlideLayout|SpreadsheetLab|office-export|office-slide-export)\.[^/]+\.js/u.test(
        request.url(),
      )
    )
      requests.push(request.url());
  });
  await page.goto('materials/i11/presentation-layout/');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(0);
  await page.locator('#slide-layout').scrollIntoViewIfNeeded();
  await expect(page.locator('#slide-layout .information-lab')).toBeVisible();
  expect(requests.some((url) => url.includes('/SlideLayout.'))).toBe(true);
  expect(requests.some((url) => url.includes('/DocumentFormat.'))).toBe(false);
  expect(requests.some((url) => url.includes('/office-export.'))).toBe(false);
});
for (const lesson of officeLessons) {
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
    const exam = page.locator('#question-5');
    await exam.scrollIntoViewIfNeeded();
    await expect(
      exam.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await exam.getByRole('radio').first().check();
    await exam.getByRole('button', { name: 'Проверить ответ' }).press('Enter');
    await expect(exam.locator('.lesson-feedback')).toHaveAttribute(
      'data-verdict',
      'correct',
    );
    const href = await page
      .getByRole('link', { name: 'Перейти к заданиям' })
      .getAttribute('href');
    if (!href) throw new Error('Нет ссылки практики.');
    expect(new URL(href, page.url()).searchParams.get('numbers')).toBe(
      String(lesson.taskNumber),
    );
    if (lesson.variant13)
      expect(new URL(href, page.url()).searchParams.get('variant13')).toBe(
        lesson.variant13,
      );
    expect(errors).toEqual([]);
  });
}

for (const [title, module] of [
  ['Форматирование документа', 'DocumentFormat'],
  ['Макет слайда', 'SlideLayout'],
  ['Учебная таблица', 'SpreadsheetLab'],
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
    'DocumentFormat',
    'SlideLayout',
    'SpreadsheetLab',
    'office-export',
    'office-slide-export',
  ]) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  for (const lesson of officeLessons)
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
  for (const lesson of officeLessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternative = page.locator('.interactive-alternative');
    await alternative.locator('summary').click();
    await expect(alternative.locator('div')).toBeVisible();
    await page.locator('#example-1 [data-lesson-example] > summary').click();
    await expect(page.locator('#example-1 .lesson-steps > li')).toHaveCount(5);
    await expect(page.locator('#example-1 a[download]')).toBeVisible();
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
  await mkdir('.cache/t7-10-screens', { recursive: true });
  for (const [route, id] of [
    ['materials/i11/document-paragraphs/', 'document-format'],
    ['materials/i11/presentation-layout/', 'slide-layout'],
    ['materials/i12/sheet-charts/', 'spreadsheet-lab'],
  ]) {
    if (!route || !id) throw new Error('Нет сцены.');
    const scene = await openScene(page, route, id);
    await scene.screenshot({
      path: `.cache/t7-10-screens/${id}-${info.project.name}.png`,
    });
    await scene
      .locator('.office-document, .office-slide, figure svg')
      .first()
      .screenshot({
        path: `.cache/t7-10-screens/${id}-preview-${info.project.name}.png`,
      });
    await page
      .locator('#theory svg')
      .first()
      .screenshot({
        path: `.cache/t7-10-screens/${id}-theory-${info.project.name}.png`,
      });
  }
});
