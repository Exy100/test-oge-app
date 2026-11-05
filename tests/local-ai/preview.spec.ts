import { expect, test } from '@playwright/test';

test('actual browser and Worker share an origin; disabled AI preserves answer checking', async ({
  page,
}) => {
  const errors: string[] = [];
  const posts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/') && request.method() === 'POST')
      posts.push(request.url());
  });
  await page.goto('stream/?numbers=10');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  await expect(page.locator('.stream-controls')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Твой ответ', { exact: true }).fill('1');
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  const health = page.waitForResponse((response) =>
    response.url().endsWith('/api/ai/health'),
  );
  await page.getByRole('button', { name: 'Получить разбор с ИИ' }).click();
  const response = await health;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  await expect(page.locator('.ai-panel').getByRole('alert')).toContainText(
    'ИИ отключён',
  );
  await expect(page.locator('.ai-panel')).toContainText('RouterAI');
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Проверить ответ', exact: true }),
  ).toBeEnabled();
});

test('local proxy preserves Origin and recipient guards of the actual Worker', async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing local URL');
  const origin = new URL(baseURL).origin;
  const health = await request.get(origin + '/api/ai/health', {
    headers: { 'X-AI-Provider': 'routerai' },
  });
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ enabled: false, provider: 'routerai' });
  const endpoint = origin + '/api/ai/stream-feedback';
  const data = {
    generatorId: 'numeral-sum-v2',
    seed: 'routerai-local-check',
    answer: '1',
  };
  const foreign = await request.post(endpoint, {
    headers: {
      Origin: 'https://untrusted.invalid',
      'X-AI-Provider': 'routerai',
    },
    data,
  });
  expect(foreign.status()).toBe(403);
  const mismatch = await request.post(endpoint, {
    headers: { Origin: origin, 'X-AI-Provider': 'openrouter' },
    data,
  });
  expect(mismatch.status()).toBe(409);
  const missing = await request.post(endpoint, {
    headers: { Origin: origin },
    data,
  });
  expect(missing.status()).toBe(409);
  const valid = await request.post(endpoint, {
    headers: { Origin: origin, 'X-AI-Provider': 'routerai' },
    data,
  });
  expect(valid.status()).toBe(503);
  expect(await valid.json()).toMatchObject({ error: { code: 'ai-disabled' } });
});

test('API privacy page identifies RouterAI and does not claim data never leaves the browser', async ({
  page,
}) => {
  await page.goto('privacy/');
  await expect(page.locator('#privacy-ai').locator('..')).toContainText(
    'RouterAI',
  );
  await expect(
    page.getByRole('link', { name: 'политике конфиденциальности RouterAI' }),
  ).toHaveAttribute('href', 'https://routerai.ru/terms/privacy');
  await expect(page.locator('#privacy-ai').locator('..')).not.toContainText(
    'разбор ответов с помощью ИИ не подключён',
  );
});
