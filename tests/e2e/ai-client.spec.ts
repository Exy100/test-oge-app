import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PREFIX, defaults } from '../../src/core/storage/schemas';

const markdown =
  '### Итог\nРазбор $2^3$. [[lesson:bits-bytes]] [[stream:10]] [[lesson:missing]] [чужой](https://outside.test/) <img src=x onerror=alert(1)>';
const body = `data: ${JSON.stringify({ delta: markdown })}\n\ndata: [DONE]\n\n`;
function local(baseURL: string | undefined, route = 'dev/ai/') {
  if (!baseURL) throw new Error('Missing base URL');
  const url = new URL(route, baseURL);
  url.protocol = 'http:';
  url.port = '4324';
  return url.href;
}
async function ready(page: Page, baseURL: string | undefined) {
  await page.goto(local(baseURL));
  await expect(
    page.getByRole('group', { name: 'Клиентский разбор' }),
  ).toHaveAttribute('aria-busy', 'false');
}
async function start(page: Page) {
  await page
    .getByRole('button', { name: 'Получить разбор с ИИ', exact: true })
    .click();
}

test('API panel requires informed consent, safely renders, restores cache and invalidates it for a changed draft', async ({
  page,
  baseURL,
}) => {
  let calls = 0;
  await page.route('**/api/ai/stream-feedback', async (route) => {
    calls++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toMatchObject({
      generatorId: 'numeral-sum-v2',
      answer: '1',
    });
    await route.fulfill({ contentType: 'text/event-stream', body });
  });
  await ready(page, baseURL);
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, enabled: true }));
  }, PREFIX + 'aiConsent');
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Клиентский разбор' }),
  ).toHaveAttribute('aria-busy', 'false');
  await start(page);
  const dialog = page.getByRole('dialog', { name: 'Разрешить разбор с ИИ?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('OpenRouter');
  await expect(dialog).toContainText('Мой черновик');
  expect(calls).toBe(0);
  expect(
    (await new AxeBuilder({ page }).include('dialog').analyze()).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Получить разбор с ИИ' }),
  ).toBeFocused();
  expect(calls).toBe(0);
  await start(page);
  await dialog.getByRole('button', { name: 'Разрешить и отправить' }).click();
  const output = page.getByRole('region', {
    name: 'Текст разбора',
    exact: true,
  });
  await expect(
    page.locator('.ai-panel').getByRole('status').first(),
  ).toHaveText('Разбор готов.');
  await expect(output).toBeFocused();
  await expect(output.locator('math')).toHaveCount(1);
  await expect(output.getByRole('link')).toHaveCount(2);
  await expect(output.locator('img,script,iframe')).toHaveCount(0);
  await expect(output).not.toContainText('[[lesson:missing]]');
  await expect(page.locator('.ai-panel')).toContainText(
    'ИИ может ошибаться. Сверяйся с эталонным решением',
  );
  expect(calls).toBe(1);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      (await new AxeBuilder({ page }).include('.ai-panel').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Клиентский разбор' }),
  ).toHaveAttribute('aria-busy', 'false');
  await start(page);
  await expect(output).toContainText('Разбор');
  expect(calls).toBe(1);
  await page.getByLabel('Черновик для проверки').fill('Изменённый черновик');
  await expect(output).toHaveCount(0);
  await start(page);
  await expect(output).toContainText('Разбор');
  expect(calls).toBe(2);
  // An imported preference/policy cannot silently authorise a new transmission.
  const areas = defaults();
  areas.aiConsent = {
    version: 1,
    enabled: true,
    policy: 'openrouter-feedback-v1',
  };
  await page.goto(local(baseURL, 'settings/'));
  await expect(page.locator('.settings-panel')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles({
    name: 'consent.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'oge-informatics',
        version: 1,
        areas,
        aiCache: { version: 1, entries: [] },
      }),
    ),
  });
  await page
    .getByRole('button', { name: 'Заменить данные', exact: true })
    .click();
  await expect(page.locator('.settings-panel').getByRole('status')).toHaveText(
    'Данные импортированы.',
  );
  await ready(page, baseURL);
  await start(page);
  await expect(dialog).toBeVisible();
  expect(calls).toBe(2);
});

test('refusal sends nothing, HTTP budget errors show a safe retry and do not cache a partial answer', async ({
  page,
  baseURL,
}) => {
  let calls = 0;
  await page.route('**/api/ai/stream-feedback', async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'budget', message: 'private-provider-message' },
        }),
      });
    else await route.fulfill({ contentType: 'text/event-stream', body });
  });
  await ready(page, baseURL);
  await start(page);
  await page
    .getByRole('button', { name: 'Не отправлять', exact: true })
    .click();
  expect(calls).toBe(0);
  await start(page);
  await page.getByRole('button', { name: 'Разрешить и отправить' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Дневной лимит' }),
  ).toBeVisible();
  await expect(page.locator('.ai-panel')).not.toContainText(
    'private-provider-message',
  );
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PREFIX + 'aiCache',
    ),
  ).toBeNull();
  await page
    .getByRole('button', { name: 'Попробовать ещё раз', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Текст разбора', exact: true }),
  ).toContainText('Разбор');
  expect(calls).toBe(2);
});

test('stop and cross-tab revocation abort active requests, clear cache and require consent again', async ({
  page,
  context,
  baseURL,
}) => {
  let calls = 0;
  let delayed: import('@playwright/test').Route | undefined;
  await page.route('**/api/ai/stream-feedback', async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({ contentType: 'text/event-stream', body });
    else delayed = route;
  });
  await ready(page, baseURL);
  await start(page);
  await page.getByRole('button', { name: 'Разрешить и отправить' }).click();
  await expect(
    page.getByRole('region', { name: 'Текст разбора', exact: true }),
  ).toContainText('Разбор');
  await page.getByLabel('Черновик для проверки').fill('Для остановки');
  await start(page);
  await expect.poll(() => calls).toBe(2);
  await page
    .getByRole('button', { name: 'Остановить разбор', exact: true })
    .click();
  await expect(
    page.locator('.ai-panel').getByRole('status').first(),
  ).toContainText('Разбор остановлен');
  await delayed?.fulfill({ contentType: 'text/event-stream', body });
  await expect(
    page.getByRole('region', { name: 'Текст разбора', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Повторить разбор', exact: true })
    .click();
  await expect.poll(() => calls).toBe(3);
  const settings = await context.newPage();
  await settings.goto(local(baseURL, 'settings/'));
  await settings
    .getByRole('button', {
      name: 'Отозвать согласие на отправку ответов',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Получить разбор с ИИ', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PREFIX + 'aiCache',
    ),
  ).toBeNull();
  await delayed?.fulfill({ contentType: 'text/event-stream', body });
  await start(page);
  await expect(
    page.getByRole('dialog', { name: 'Разрешить разбор с ИИ?' }),
  ).toBeVisible();
  expect(calls).toBe(3);
  await settings.close();
});
