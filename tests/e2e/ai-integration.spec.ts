import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { link, ready, stats } from '../fixtures/stream-browser';

const generator = generators.find((item) => item.id === 'numeral-sum-v2');
if (!generator) throw new Error('Missing generator');
const task = generator.generate('ai-api-integration');
if (task.answer.type !== 'integer') throw new Error('Expected integer answer');
const correct = task.answer.value;

for (const [label, answer] of [
  ['correct', correct],
  ['incorrect', String(BigInt(correct) + 1n)],
] as const) {
  test(`stream API explains a ${label} answer after consent without changing its local verdict`, async ({
    page,
    baseURL,
  }) => {
    if (!baseURL || answer === undefined) throw new Error('Missing fixture');
    const url = new URL(link(task), baseURL);
    url.protocol = 'http:';
    url.port = '4324';
    let calls = 0;
    await page.route('**/api/ai/health', (route) =>
      route.fulfill({ json: { enabled: true } }),
    );
    await page.route('**/api/ai/stream-feedback', async (route) => {
      calls++;
      expect(route.request().postDataJSON()).toEqual({
        generatorId: task.generatorId,
        seed: task.seed,
        answer,
        reasoning: 'Мой ход решения',
      });
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"delta":"### Разбор\\nПроверь веса разрядов. [[stream:10]]"}\n\ndata: [DONE]\n\n',
      });
    });
    await page.goto(url.href);
    await ready(page);
    await page.getByLabel('Твой ответ', { exact: true }).fill(answer);
    await page
      .getByLabel('Как я решал', { exact: true })
      .fill('Мой ход решения');
    await page
      .getByRole('button', { name: 'Проверить ответ', exact: true })
      .click();
    const before = await stats(page);
    await page.getByRole('button', { name: 'Получить разбор с ИИ' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(answer);
    expect(calls).toBe(0);
    await dialog.getByRole('button', { name: 'Разрешить и отправить' }).click();
    await expect(
      page.getByRole('region', { name: 'Текст разбора', exact: true }),
    ).toContainText('Проверь веса');
    expect(calls).toBe(1);
    expect(await stats(page)).toEqual(before);
    await expect(page.locator('[data-verdict]')).toHaveAttribute(
      'data-verdict',
      label,
    );
    expect(
      (await new AxeBuilder({ page }).include('.ai-panel').analyze())
        .violations,
    ).toEqual([]);
  });
}
test('disabled or unavailable health sends no answers and the stream continues', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing base URL');
  const url = new URL(link(task), baseURL);
  url.protocol = 'http:';
  url.port = '4324';
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/ai/'))
      posts++;
  });
  await page.route('**/api/ai/health', (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto(url.href);
  await ready(page);
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  const before = await stats(page);
  await page.getByRole('button', { name: 'Получить разбор с ИИ' }).click();
  await expect(page.locator('.ai-panel').getByRole('alert')).toContainText(
    'ИИ отключён',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.route('**/api/ai/health', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page.locator('.ai-panel').getByRole('alert')).toContainText(
    'Проверь соединение',
  );
  expect(posts).toBe(0);
  expect(await stats(page)).toEqual(before);
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Проверить ответ', exact: true }),
  ).toBeEnabled();
});
