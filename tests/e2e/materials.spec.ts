import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PREFIX } from '../../src/core/storage/schemas';
import { resolveStreamTask } from '../../src/core/stream/catalog';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const dev = 'http://127.0.0.1:4324/test-oge-app/';
const gallery = dev + 'dev/materials/';
const lesson = dev + 'dev/lessons/';

test('catalog JavaScript stays within the 60 KB gzip budget including inline code', async ({
  page,
}) => {
  await page.goto('materials/');
  await expect(page.getByRole('checkbox').first()).toBeEnabled();
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  let bytes = 0;
  const root = resolve('dist');
  for (const resource of new Set(resources)) {
    const url = new URL(resource);
    if (!/\.m?js$/u.test(url.pathname)) continue;
    expect(url.origin).toBe(new URL(page.url()).origin);
    const path = resolve(root, url.pathname.replace('/test-oge-app/', ''));
    expect(path.startsWith(root + '/')).toBe(true);
    bytes += gzipSync(await readFile(path)).length;
  }
  const inline = await page.locator('script:not([src])').allTextContents();
  bytes += inline
    .filter((script) => script.trim())
    .reduce((sum, script) => sum + gzipSync(script).length, 0);
  expect(bytes).toBeLessThanOrEqual(60_000);
});

test('home and navigation lead to fourteen topics and six available information lessons', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Материалы', exact: true })
    .click();
  await expect(page).toHaveURL(/\/materials\/$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Материалы');
  await expect(
    page.getByRole('link', { name: 'Материалы', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
  await expect(page.locator('.materials-map a')).toHaveCount(14);
  await expect(page.getByRole('checkbox')).toHaveCount(16);
  await expect(page.locator('.materials-lessons li')).toHaveCount(6);
  await expect(page.locator('.materials-completed')).toContainText('0 из 6');
  expect((await page.goto('materials/i1/absent-lesson/'))?.status()).toBe(404);
});

test('multi-number filtering, reload and Back/Forward preserve the selected topics', async ({
  page,
}) => {
  await page.goto('materials/');
  await page.getByRole('checkbox', { name: '№1', exact: true }).check();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(1);
  await page.getByRole('checkbox', { name: '№13', exact: true }).check();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(2);
  await expect(
    page.locator('.materials-map a[data-selected="true"]'),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: '№13', exact: true }),
  ).toBeChecked();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(2);
  await page.goBack();
  await expect(
    page.getByRole('checkbox', { name: '№13', exact: true }),
  ).not.toBeChecked();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(1);
  await page.goForward();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'Все номера', exact: true }).click();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
  await expect(page).toHaveURL(/\/materials\/$/u);
});

test('invalid query falls back to all topics and can be corrected', async ({
  page,
}) => {
  await page.goto('materials/?numbers=17');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось прочитать номера',
  );
  await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
  await page.getByRole('checkbox', { name: '№9', exact: true }).check();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(1);
  await expect(page.locator('#i4')).toContainText('Графы и схемы');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('SVG keyboard navigation and prerequisite links lead to visible sections after clearing the filter', async ({
  page,
}) => {
  await page.goto('materials/?numbers=1');
  const node = page.locator('.materials-map a').last();
  await node.focus();
  await node.press('Enter');
  await expect(page).toHaveURL(/\/materials\/#i14$/u);
  await expect(page.locator('#i14')).toBeInViewport();
  await page.goto('materials/?numbers=16');
  await expect(page.locator('.materials-topic:visible')).toHaveCount(1);
  await page
    .locator('#i14')
    .getByRole('link', { name: 'Чтение программ', exact: true })
    .click();
  await expect(page).toHaveURL(/\/materials\/#i6$/u);
  await expect(page.locator('#i6')).toBeInViewport();
  await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
});

test('computer work routes preserve the two alternatives of task 13', async ({
  page,
}) => {
  await page.goto('materials/?numbers=13');
  await expect(
    page.getByRole('heading', { name: 'Файлы, офисные программы и код' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Документ · №13.2', exact: true })
    .click();
  await expect(page.getByLabel('Что решать')).toHaveValue('13.2');
  await page.goto('materials/?numbers=13');
  await page
    .getByRole('link', { name: 'Презентация · №13.1', exact: true })
    .click();
  await expect(page.getByLabel('Что решать')).toHaveValue('13.1');
});

test('completion survives reload and updates an open catalog in another tab; undo is reversible', async ({
  page,
  context,
}) => {
  await page.goto(lesson);
  const catalog = await context.newPage();
  await catalog.goto(gallery);
  await expect(catalog.locator('.materials-completed')).toContainText('0 из 1');
  const mark = page.getByRole('button', { name: 'Урок пройден', exact: true });
  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await expect(catalog.locator('.materials-completed')).toContainText('1 из 1');
  await catalog.reload();
  await expect(catalog.locator('.materials-lessons')).toContainText('Пройден');
  await catalog.locator('.materials-lessons a').click();
  await expect(
    catalog.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await mark.click();
  await catalog.goto(gallery);
  await expect(catalog.locator('.materials-completed')).toContainText('0 из 1');
});

test('Settings export, reset and import restore lesson marks across tabs', async ({
  page,
  context,
}) => {
  await page.goto(lesson);
  await page.getByRole('button', { name: 'Урок пройден', exact: true }).click();
  const catalog = await context.newPage();
  await catalog.goto(gallery);
  const settings = await context.newPage();
  await settings.goto(dev + 'settings/');
  const waiting = settings.waitForEvent('download');
  await settings.getByRole('button', { name: 'Экспортировать данные' }).click();
  const exported = await (await waiting).path();
  await settings
    .getByRole('button', { name: 'Удалить все данные проекта' })
    .click();
  await settings.getByRole('button', { name: 'Подтвердить удаление' }).click();
  await expect(catalog.locator('.materials-completed')).toContainText('0 из 1');
  await settings
    .getByLabel('Импортировать JSON, до 2 МБ')
    .setInputFiles(exported);
  await settings
    .getByRole('button', { name: 'Заменить данные', exact: true })
    .click();
  await expect(catalog.locator('.materials-completed')).toContainText('1 из 1');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('saved marks for absent lessons do not inflate progress', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          entries: [
            {
              lessonId: 'absent',
              completed: true,
              quizCorrect: 5,
              quizTotal: 5,
              levels: [],
            },
          ],
        }),
      );
    },
    { key: PREFIX + 'lessonProgress' },
  );
  await page.goto(gallery);
  await expect(page.locator('.materials-completed')).toContainText('0 из 1');
});

test('a blocked store leaves a working in-memory mark and an honest notice', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto(lesson);
  const mark = page.getByRole('button', { name: 'Урок пройден', exact: true });
  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#storage-notice')).toContainText(
    'памяти этой страницы',
  );
});

test('a full imported area reports an error without deleting its entries', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          entries: Array.from({ length: 500 }, (_, index) => ({
            lessonId: 'import-' + String(index),
            completed: true,
            quizCorrect: 0,
            quizTotal: 0,
            levels: [],
          })),
        }),
      );
    },
    { key: PREFIX + 'lessonProgress' },
  );
  await page.goto(lesson);
  await page.getByRole('button', { name: 'Урок пройден', exact: true }).click();
  await expect(
    page.locator('.lesson-completion').getByRole('alert'),
  ).toContainText('Не удалось сохранить');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a real correct answer updates topic practice without inventing a completed lesson', async ({
  page,
}) => {
  const task = resolveStreamTask({
    generatorId: 'numeral-sum-v2',
    taskNumber: 10,
    seed: 'materials-progress',
  });
  const answer = solveParameters(parseGeneratedProblem(task))?.[0];
  if (!answer) throw new Error('Нет независимого ответа.');
  await page.goto(
    'stream/?task=numeral-sum-v2&seed=materials-progress&numbers=10',
  );
  await page.getByLabel('Твой ответ', { exact: true }).fill(answer);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  await page.goto('materials/?numbers=10');
  await expect(page.locator('#i9 [data-material-automatic]')).toHaveText(
    'Краткие ответы: верно 1 из 1.',
  );
  await expect(page.locator('.materials-completed')).toBeHidden();
});

test('all topics and the SVG map remain readable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Не задан адрес сайта.');
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('materials/');
    await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
    await expect(page.locator('.materials-map a')).toHaveCount(14);
    await expect(page.getByRole('checkbox').first()).toBeDisabled();
    await expect(
      page.getByRole('link', { name: 'Документ · №13.2', exact: true }),
    ).toBeVisible();
    await expect(page.locator('noscript > p')).toContainText('все темы');
  } finally {
    await context.close();
  }
});

test('both themes, reduced motion and 200% text are accessible at 360px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('materials/');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath('materials-mobile.png') });
  await page.locator('#i11').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('materials-computer-mobile.png'),
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.locator('.materials-map-scroll').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('materials-map-desktop.png') });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
