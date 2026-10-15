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

test('Python examples render code and input tables without mobile overflow', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
  await page
    .getByRole('combobox', { name: 'Генератор', exact: true })
    .selectOption('program-branch-v1');
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  const example = page.locator('.generator-example').first();
  await expect(example.locator('pre code')).toContainText('print("ДА")');
  await expect(example.getByRole('table')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const id of [
  'url-move-v1',
  'search-three-v1',
  'paths-via-v1',
  'radix-compare-v1',
]) {
  test(`${id}: tables, answers and mobile accessibility`, async ({ page }) => {
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
    await page
      .getByRole('combobox', { name: 'Генератор', exact: true })
      .selectOption(id);
    await page.getByRole('button', { name: 'Показать 20 задач' }).click();
    const examples = page.locator('.generator-example');
    await expect(examples).toHaveCount(20);
    await expect(examples.first().getByRole('table')).toBeVisible();
    await expect(examples.first()).toContainText('Ответ:');
    if (id === 'paths-via-v1') {
      const table = examples.first().getByRole('table');
      await table.focus();
      await expect(table).toBeFocused();
      const overflow = await table.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      );
      if (overflow) {
        await page.keyboard.press('ArrowRight');
        await expect
          .poll(() => table.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
    }

    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('№14: downloadable ODS dataset matches Node and binary preview stays readable', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
  await page.getByLabel('Seed', { exact: true }).fill('browser-sheet');
  await page
    .getByRole('combobox', { name: 'Генератор', exact: true })
    .selectOption('sheet-revenue-v1');
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  const example = page.locator('.generator-example').first();
  await example.getByRole('button', { name: 'Подготовить файлы' }).click();
  const link = example.getByRole('link', { name: 'Скачать ZIP', exact: true });
  await expect(link).toBeVisible();
  const pending = page.waitForEvent('download');
  await link.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('Missing ZIP download');
  const { readFile } = await import('node:fs/promises');
  const { createTaskDataset } =
    await import('../../src/core/generators/task-dataset');
  const task = generators
    .find((item) => item.id === 'sheet-revenue-v1')
    ?.generate('browser-sheet:0');
  if (!task) throw new Error('Missing spreadsheet generator');
  const expected = await createTaskDataset(task);
  expect(await readFile(path)).toEqual(Buffer.from(expected.archive));
  await example
    .getByLabel('Файл для просмотра')
    .selectOption('source/data.ods');
  await expect(example.locator('.task-file-preview')).toHaveText(
    'Офисный файл. Скачай ZIP и открой файл в LibreOffice.',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
