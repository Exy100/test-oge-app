import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { defaults, PREFIX, parseBackup } from '../../src/core/storage/schemas';

async function fixture(page: import('@playwright/test').Page) {
  await page.goto('settings/');
  await expect(page.locator('.settings-panel')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}
const makeBackup = () => ({
  format: 'oge-informatics',
  version: 1,
  areas: defaults(),
  aiCache: { version: 1, entries: [] },
});

test('оформление сохраняется, применяется между страницами и доступно в обеих темах', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  for (const theme of ['light', 'dark']) {
    await page
      .getByLabel('Тема оформления', { exact: true })
      .selectOption(theme);
    await expect(page.getByLabel('Тема', { exact: true })).toHaveValue(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Размер шрифта', { exact: true }).selectOption('150');
  await page.getByLabel('Анимации', { exact: true }).uncheck();
  await expect(page.locator('#navigation-motion')).toHaveJSProperty(
    'disabled',
    true,
  );
  await page.getByLabel('Предлагать разбор с ИИ').check();
  await page.reload();
  await expect(page.getByLabel('Размер шрифта', { exact: true })).toHaveValue(
    '150',
  );
  await expect(page.getByLabel('Предлагать разбор с ИИ')).toBeChecked();
  await page.getByRole('link', { name: '← На главную', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-size', '150');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page
      .locator('.number-card')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Размер шрифта', { exact: true }).selectOption('200');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(errors).toEqual([]);
});

test('экспорт и подтверждённый импорт сохраняют все области, отмена оставляет данные', async ({
  page,
}) => {
  await fixture(page);
  const data = makeBackup();
  data.areas.settings.theme = 'dark';
  data.areas.lessonProgress.entries = [
    {
      lessonId: 'binary',
      completed: true,
      quizCorrect: 2,
      quizTotal: 3,
      levels: ['one'],
    },
  ];
  const file = {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  };
  await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles(file);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  await expect(page.getByLabel('Тема оформления')).toHaveValue('system');
  await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles(file);
  await page
    .getByRole('button', { name: 'Заменить данные', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Данные импортированы.');
  await expect(page.getByLabel('Тема оформления')).toHaveValue('dark');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать данные' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(parseBackup(await readFile(path, 'utf8'))).toEqual(data);
  await page.reload();
  await expect(page.getByLabel('Тема оформления')).toHaveValue('dark');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as unknown,
      PREFIX + 'lessonProgress',
    ),
  ).toEqual(data.areas.lessonProgress);
});

test('неверный импорт даёт понятную ошибку и не меняет настройки', async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel('Тема оформления').selectOption('dark');
  for (const text of [
    '{broken',
    JSON.stringify({ ...makeBackup(), version: 99 }),
    JSON.stringify({
      ...makeBackup(),
      areas: { ...defaults(), settings: { version: 1, theme: 'invalid' } },
    }),
  ]) {
    await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(
      page.locator('.settings-panel [role="alert"]'),
    ).not.toBeEmpty();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Тема оформления')).toHaveValue('dark');
  }
  await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(2_000_001, 'x'),
  });
  await expect(page.locator('.settings-panel [role="alert"]')).toContainText(
    'Максимум — 2 МБ',
  );
});

test('удаление требует подтверждения и сохраняет данные соседних проектов', async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel('Тема оформления').selectOption('dark');
  await page.evaluate(() => {
    localStorage.setItem('neighbor', 'local');
    sessionStorage.setItem('neighbor', 'session');
  });
  await page
    .getByRole('button', { name: 'Удалить все данные проекта' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  await expect(page.getByLabel('Тема оформления')).toHaveValue('dark');
  await page
    .getByRole('button', { name: 'Удалить все данные проекта' })
    .click();
  await page.getByRole('button', { name: 'Подтвердить удаление' }).click();
  await expect(page.getByRole('status')).toHaveText('Данные проекта удалены.');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    'neighbor',
  ]);
  expect(await page.evaluate(() => sessionStorage.getItem('neighbor'))).toBe(
    'session',
  );
  await expect(page.getByLabel('Тема оформления')).toHaveValue('system');
  await expect(
    page.getByRole('button', { name: 'Удалить все данные проекта' }),
  ).toBeFocused();
});

for (const failure of ['blocked', 'quota'])
  test(`сохранение в памяти при ${failure}`, async ({ page }) => {
    await page.addInitScript((kind) => {
      if (kind === 'blocked')
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Blocked', 'SecurityError');
          },
        });
      else
        Storage.prototype.setItem = () => {
          throw new DOMException('Full', 'QuotaExceededError');
        };
    }, failure);
    await fixture(page);
    await page.getByLabel('Размер шрифта').selectOption('125');
    await expect(page.locator('#storage-notice')).toContainText('памяти');
    await expect(page.locator('html')).toHaveAttribute('data-font-size', '125');
    await page.getByLabel('Тема оформления').selectOption('dark');
    await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('dark');
  });

test('перенос старой темы, синхронизация настроек между вкладками и сброс повреждённой области', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('migration-test')) {
      localStorage.setItem('oge.theme', 'dark');
      localStorage.setItem('oge:informatics:v1:streamStats', '{broken');
      localStorage.setItem('migration-test', 'done');
    }
  });
  await fixture(page);
  await expect(page.getByLabel('Тема оформления')).toHaveValue('dark');
  expect(
    await page.evaluate(() => localStorage.getItem('oge.theme')),
  ).toBeNull();
  await expect(page.locator('#storage-notice')).toContainText('сброшена');
  const other = await context.newPage();
  await other.goto('settings/');
  await expect(other.locator('.settings-panel')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await other.getByLabel('Размер шрифта').selectOption('125');
  await expect(page.getByLabel('Размер шрифта')).toHaveValue('125');
  await other.close();
});

test('настройки объясняют необходимость JavaScript и остаются читаемыми без него', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Не задан адрес сайта.');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto('settings/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Настройки',
    );
    await expect(page.locator('noscript p')).toBeVisible();
    await expect(page.locator('noscript p')).toContainText('включи JavaScript');
    await expect(
      page.getByRole('button', { name: 'Экспортировать данные' }),
    ).toBeDisabled();
    await expect(page.getByLabel('Размер шрифта')).toBeDisabled();
  } finally {
    await context.close();
  }
});
