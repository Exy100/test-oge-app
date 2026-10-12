import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { textVolume } from '../../src/core/generators/01/text-volume';
import { generators } from '../../src/core/generators';

test('all registered subtypes reproduce Node tasks and render code tables in the gallery', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
  const seeds = ['', 'Пример 🧩', 'golden-1'];
  const actual = await page.evaluate(async (seeds) => {
    const path = '/test-oge-app/src/core/generators/index.ts';
    const { generators } = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../../src/core/generators');
    return generators.map((generator) =>
      seeds.map((seed) => {
        const task = generator.generate(seed);
        return { task, verified: generator.verify(task) };
      }),
    );
  }, seeds);
  expect(actual).toEqual(
    generators.map((generator) =>
      seeds.map((seed) => ({ task: generator.generate(seed), verified: true })),
    ),
  );
  for (const id of ['missing-code-v1', 'route-via-v1']) {
    await page
      .getByRole('combobox', { name: 'Генератор', exact: true })
      .selectOption(id);
    await page.getByRole('button', { name: 'Показать 20 задач' }).click();
    await expect(page.locator('.generator-example')).toHaveCount(20);
    await expect(
      page.locator('.generator-example').first().getByRole('table'),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

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
