import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('системная тема, ручной выбор и сохранение до появления содержимого', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  const theme = page.getByLabel('Тема', { exact: true });
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(theme).toHaveValue('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await theme.selectOption('dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.querySelector('body')) {
        document.documentElement.dataset.themeAtBody =
          document.documentElement.dataset.theme ?? 'missing';
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(root).toHaveAttribute('data-theme-at-body', 'dark');
  await expect(theme).toHaveValue('dark');
  await expect(page.getByRole('button', { name: 'Проверить' })).toBeEnabled();
  const answer = page.getByLabel('Твой ответ', { exact: false });
  await answer.fill('47');
  await answer.press('Enter');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await answer.fill('48');
  await answer.press('Enter');
  await expect(page.getByRole('status')).toContainText('Верно, получилось!');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await theme.selectOption('light');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('solved-count')).toHaveText('1');
  await theme.selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
});

test('тема без доступа к хранилищу и клавиатурный skip-link', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'К основному содержимому' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const theme = page.getByLabel('Тема', { exact: true });
  await theme.focus();
  await theme.press('End');
  await theme.press('Enter');
  await expect(theme).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page
      .locator('.number-card')
      .evaluate((card) => getComputedStyle(card).animationName),
  ).toBe('none');
});

test('повреждённая настройка, синхронизация вкладок и сброс', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('oge:informatics:v1:settings', 'broken');
  });
  await page.reload();
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('system');
  const other = await context.newPage();
  await other.goto('./');
  await other.getByLabel('Тема', { exact: true }).selectOption('dark');
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('dark');
  await other.evaluate(() => {
    localStorage.clear();
  });
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('system');
});

test('локальная кириллица, широкий экран и масштаб текста 200%', async ({
  page,
}) => {
  await page.goto('./');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      loaded:
        document.fonts.check('16px "Golos Text Variable"', 'Информатика Ёй') &&
        document.fonts.check('16px "JetBrains Mono Variable"', '1101'),
      requests: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.endsWith('.woff2')),
    };
  });
  expect(fonts.loaded).toBe(true);
  expect(
    fonts.requests.some((url) => url.includes('golos-text-cyrillic')),
  ).toBe(true);
  expect(
    fonts.requests.every((url) =>
      url.startsWith('https://127.0.0.1:4322/test-oge-app/'),
    ),
  ).toBe(true);
  for (const width of [1920, 640, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `Width ${String(width)} at 200% text`,
    ).toBeLessThanOrEqual(width);
    await expect(page.getByLabel('Тема', { exact: true })).toBeVisible();
  }
});

test('без JavaScript сохраняется системная тёмная тема и доступна теория', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto('https://127.0.0.1:4322/test-oge-app/');
  expect(
    await page
      .locator('html')
      .evaluate((root) => getComputedStyle(root).backgroundColor),
  ).toBe('rgb(17, 28, 25)');
  await expect(page.getByLabel('Тема', { exact: true })).toBeDisabled();
  await page.locator('.material-card summary').first().click();
  await expect(page.locator('.material-example').first()).toBeVisible();
  await context.close();
});

test('служебная страница и ссылка исключены из production', async ({
  page,
  request,
}) => {
  await page.goto('./');
  await expect(
    page.getByRole('link', { name: 'Дизайн-система', exact: true }),
  ).toHaveCount(0);
  expect((await request.get('dev/ui/')).status()).toBe(404);
});
