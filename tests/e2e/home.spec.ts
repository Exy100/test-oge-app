import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('welcome, local assets and accessibility under the project path', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${String(response.status())} ${response.url()}`);
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('ОГЭ по информатике');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'ОГЭ по информатике',
  );
  await expect(page.locator('main')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(resources.some((url) => url.includes('/test-oge-app/_astro/'))).toBe(
    true,
  );
  expect(
    resources.every((url) =>
      url.startsWith('http://127.0.0.1:4322/test-oge-app/'),
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('welcome stays readable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    if (!baseURL) throw new Error('Не задан адрес проверяемого сайта.');
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'ОГЭ по информатике',
    );
    await expect(
      page.getByText('Добро пожаловать!', { exact: false }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
