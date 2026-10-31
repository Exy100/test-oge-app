import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readyAiResult, savedAiAttempt } from '../fixtures/ai-result-browser';

test('result summary sends only aggregates, renders allowlisted links and refreshes after a self-assessment changes', async ({
  page,
  baseURL,
}) => {
  let calls = 0;
  await page.route('**/api/ai/variant-summary', async (route) => {
    calls++;
    const body = route.request().postDataJSON() as {
      results: { n: number; score: number | null; timeSec: null }[];
      part2Self: unknown[];
    };
    expect(Object.keys(body).sort()).toEqual([
      'part2Self',
      'results',
      'variantSeed',
    ]);
    expect(body.results).toHaveLength(16);
    expect(body.results.every((row) => row.timeSec === null)).toBe(true);
    expect(route.request().postData()).not.toContain('print(1)');
    expect(route.request().postData()).not.toContain('my-file');
    const markdown =
      '### План на 7 дней\n[[lesson:bits-bytes]] [[stream:16]] [[lesson:unknown]] [внешний](https://outside.test) <img src=x onerror=alert(1)>';
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: markdown })}\n\ndata: [DONE]\n\n`,
    });
  });
  await readyAiResult(page, baseURL);
  const panel = page.getByRole('region', {
    name: 'Сводка результата с ИИ',
    exact: true,
  });
  const before = await savedAiAttempt(page);
  await panel.getByRole('button', { name: 'Составить план с ИИ' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('null');
  await expect(dialog).not.toContainText('print(1)');
  expect(calls).toBe(0);
  await dialog.getByRole('button', { name: 'Разрешить и отправить' }).click();
  const output = panel.getByRole('region', { name: 'Текст сводки ИИ' });
  await expect(output).toContainText('План на 7 дней');
  await expect(output).toBeFocused();
  await expect(output.getByRole('link')).toHaveCount(2);
  await expect(output.locator('img,script')).toHaveCount(0);
  await expect(output).not.toContainText('[[lesson:unknown]]');
  expect(await savedAiAttempt(page)).toEqual(before);
  await panel.getByRole('button', { name: 'Составить план с ИИ' }).click();
  await expect(panel.locator(':scope > [role="status"]')).toHaveText(
    'Сводка готова.',
  );
  expect(calls).toBe(1);
  await page.locator('#result-task-15 > summary').click();
  await page.locator('#result-task-15').getByRole('radio').first().check();
  await expect(output).toHaveCount(0);
  await panel.getByRole('button', { name: 'Составить план с ИИ' }).click();
  await expect(output).toBeVisible();
  expect(calls).toBe(2);
  expect(
    (await new AxeBuilder({ page }).include('.ai-summary').analyze())
      .violations,
  ).toEqual([]);
});
