import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('страница, локальные ресурсы и доступность', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${String(response.status())} ${response.url()}`);
  });
  expect((await page.goto('./'))?.status()).toBe(200);
  await expect(page).toHaveTitle('ОГЭ по информатике — практика и теория');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'ОГЭ по информатике.',
  );
  await expect(page.getByRole('button', { name: 'Проверить' })).toBeEnabled();
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

test('проверка ответа, уникальный счётчик и следующая задача', async ({
  page,
}) => {
  await page.goto('./');
  const answer = page.getByLabel('Твой ответ', { exact: false });
  await expect(answer).toBeEnabled();
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByRole('status')).toContainText('Введи целое число');
  await expect(answer).toHaveAttribute('aria-invalid', 'true');
  await answer.fill('47');
  await answer.press('Enter');
  await expect(page.getByRole('status')).toContainText('Пока не совпало');
  await expect(page.getByTestId('solved-count')).toHaveText('0');
  await answer.fill('48');
  await answer.press('Enter');
  await expect(page.getByRole('status')).toContainText('Верно, получилось!');
  await expect(page.getByTestId('solved-count')).toHaveText('1');
  await answer.press('Enter');
  await expect(page.getByTestId('solved-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(answer).toBeFocused();
  await expect(answer).toHaveValue('');
  await expect(page.getByRole('status')).toBeEmpty();
  await expect(page.getByTestId('question')).toContainText('36 символов');
  await answer.fill('72');
  await answer.press('Enter');
  await expect(page.getByTestId('solved-count')).toHaveText('2');
  await page.reload();
  await expect(page.getByTestId('solved-count')).toHaveText('0');
});

test('смена тем, подсказки, решения и управление клавиатурой', async ({
  page,
}) => {
  await page.goto('./');
  const logic = page.getByRole('radio', { name: 'Логика' });
  await expect(logic).toBeEnabled();
  // Нативная группа radio должна переключаться стрелкой, без мыши.
  await page.getByRole('radio', { name: 'Объём текста' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(logic).toBeChecked();
  await expect(page.getByTestId('question')).toContainText('(X > 3) И (X < 7)');
  await page.getByLabel('Твой ответ').fill('4');
  await page.getByLabel('Твой ответ').press('Enter');
  await expect(page.getByRole('status')).toContainText('Верно');
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  await expect(page.locator('#practice-hints li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ещё подсказка (1/3)' }).click();
  await page.getByRole('button', { name: 'Ещё подсказка (2/3)' }).click();
  await expect(page.locator('#practice-hints li')).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Все подсказки открыты' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Показать решение' }).click();
  await expect(page.locator('#practice-solution')).toContainText(
    'число в этом диапазоне — 4',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Скрыть решение' }).click();
  await expect(page.locator('#practice-solution')).toBeHidden();
  await page.getByRole('radio', { name: 'Системы счисления' }).check();
  await expect(page.getByTestId('question')).toContainText('1101');
  await expect(page.locator('#practice-hints')).toBeHidden();
  await expect(page.getByLabel('Твой ответ')).toHaveValue('');
  await expect(page.getByRole('status')).toBeEmpty();
  await page.getByLabel('Твой ответ').fill('13');
  await page.getByLabel('Твой ответ').press('Enter');
  await expect(page.getByTestId('solved-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(page.getByTestId('question')).toContainText('10011');
});

test('теория и решения читаются без JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    if (!baseURL) throw new Error('Не задан адрес проверяемого сайта.');
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'ОГЭ по информатике.',
    );
    await expect(page.locator('.no-script')).toBeVisible();
    await expect(page.locator('.no-script')).toContainText(
      'Для автоматической проверки включи JavaScript.',
    );
    await expect(
      page.getByRole('button', { name: 'Проверить' }),
    ).toBeDisabled();
    const cards = page.locator('.material-card');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await card.locator('summary').click();
      await expect(card.locator('.material-example')).toBeVisible();
      await expect(card.locator('li')).toHaveCount(3);
    }
  } finally {
    await context.close();
  }
});
