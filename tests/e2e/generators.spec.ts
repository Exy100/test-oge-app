import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { textVolume } from '../../src/core/generators/01/text-volume';

test('generator gallery: 20 reproducible tasks, answers and solutions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
  await page.getByLabel('Seed', { exact: true }).fill('browser');
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  const examples = page.locator('.generator-example');
  await expect(examples).toHaveCount(20);
  const original = await examples.allTextContents();
  await expect(examples.first()).toContainText('browser:0');
  await expect(examples.last()).toContainText('browser:19');
  const nodeTask = textVolume.generate('browser:0');
  await expect(examples.first()).toContainText(nodeTask.statement);
  if (nodeTask.answer.type !== 'integer')
    throw new Error('Ожидается целый ответ.');
  await expect(examples.first()).toContainText(
    `Ответ: ${nodeTask.answer.value}`,
  );
  await expect(examples.first().locator('ol > li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  expect(await examples.allTextContents()).toEqual(original);
  await page.getByLabel('Seed', { exact: true }).fill('other');
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  expect(await examples.allTextContents()).not.toEqual(original);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('generator gallery is absent from production', async ({ page }) => {
  const response = await page.goto('./dev/generators/');
  expect(response?.status()).toBe(404);
});
