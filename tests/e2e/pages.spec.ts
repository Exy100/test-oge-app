import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  { path: 'about/', title: 'О проекте', status: 200 },
  { path: 'privacy/', title: 'Конфиденциальность', status: 200 },
  { path: 'missing-lesson/', title: 'Страница не найдена', status: 404 },
];
for (const infoPage of pages) {
  test(`${infoPage.title}: доступность, темы и узкий экран`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        /content.security.policy|violat.*(?:policy|directive)/iu.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    expect((await page.goto(infoPage.path))?.status()).toBe(infoPage.status);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      infoPage.title,
    );
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const resources = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((resource) => resource.name),
    );
    expect(
      resources.every(
        (url) => new URL(url).origin === new URL(page.url()).origin,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    if (infoPage.status === 404)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex',
      );
  });
}

test('навигация между страницами и удаление только своей настройки', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.getByLabel('Тема', { exact: true }).selectOption('dark');
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'О проекте', exact: true })
    .click();
  await expect(page).toHaveURL(/\/about\/$/u);
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('dark');
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Конфиденциальность', exact: true })
    .click();
  await page.evaluate(() => {
    localStorage.setItem('another-project', 'keep');
  });
  await page.getByRole('button', { name: 'Удалить сохранённую тему' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Сохранённая тема удалена',
  );
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('system');
  expect(
    await page.evaluate(() => localStorage.getItem('oge.theme')),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem('another-project')),
  ).toBe('keep');
  expect(await context.cookies()).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('О проекте');
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('system');
});

test('удаление темы сообщает об отказе хранилища', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('privacy/');
  await page.getByRole('button', { name: 'Удалить сохранённую тему' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Браузер не разрешил удалить настройку',
  );
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('system');
});

test('все информационные страницы читаются без JavaScript', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Не задан адрес сайта.');
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    for (const infoPage of pages) {
      await page.goto(infoPage.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        infoPage.title,
      );
      await expect(
        page.getByRole('link', { name: '← На главную', exact: true }),
      ).toBeVisible();
      if (infoPage.path === 'privacy/') {
        await expect(
          page.getByRole('button', { name: 'Удалить сохранённую тему' }),
        ).toBeDisabled();
        await expect(page.locator('noscript p')).toContainText(
          'Для кнопки нужен JavaScript',
        );
      }
    }
  } finally {
    await context.close();
  }
});
