import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import {
  buildVariant,
  buildFixedVariant,
  fixedVariants,
  variant13Alternatives,
} from '../../src/core/variants';
import { createVariantDataset } from '../../src/core/variants/dataset';

test('variant builder and both №13 alternatives match Node in every browser', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/variants/');
  const actual = await page.evaluate(async () => {
    const path = '/test-oge-app/src/core/variants/index.ts';
    const api = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../../src/core/variants');
    return {
      fixed: api.fixedVariants.map((item) => ({
        presentation: api.buildFixedVariant(item.id),
        document: api.buildFixedVariant(item.id, 'document'),
      })),
      generated: ['', 'Пример 🧩', 'golden-1'].map((seed) => ({
        variant: api.buildVariant(seed),
        alternatives: api.variant13Alternatives(seed),
      })),
    };
  });
  expect(actual).toEqual({
    fixed: fixedVariants.map((item) => ({
      presentation: buildFixedVariant(item.id),
      document: buildFixedVariant(item.id, 'document'),
    })),
    generated: ['', 'Пример 🧩', 'golden-1'].map((seed) => ({
      variant: buildVariant(seed),
      alternatives: variant13Alternatives(seed),
    })),
  });
});
test('variant review: sixteen numbers, one selected №13, exact downloaded files and mobile accessibility', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/variants/');
  await page
    .getByRole('combobox', { name: 'Фиксированный вариант', exact: true })
    .selectOption('V03');
  await page
    .getByRole('combobox', { name: 'Работа №13', exact: true })
    .selectOption('document');
  await page
    .getByRole('button', { name: 'Собрать фиксированный', exact: true })
    .click();
  await expect(page.locator('.variant-task')).toHaveCount(16);
  await expect(
    page.locator('.variant-task').nth(8).getByRole('img'),
  ).toBeVisible();
  const formula = page
    .locator('.variant-task')
    .nth(9)
    .getByRole('region', { name: 'Формула', exact: true });
  await formula.focus();
  await expect(formula).toBeFocused();
  await expect(
    page.getByRole('status', { name: 'Состав варианта' }),
  ).toHaveText('V03: 16 заданий, максимум 21 балл. Выбрана работа №13.2.');
  await expect(
    page.getByRole('heading', { name: '13.1 Презентация', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '13.2 Документ — выбран', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Задание №15', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Задание №16', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Подготовить комплект для разбора',
      exact: true,
    })
    .click();
  const link = page.getByRole('link', {
    name: 'Скачать комплект ZIP',
    exact: true,
  });
  await expect(link).toBeVisible();
  const pending = page.waitForEvent('download');
  await link.click();
  const path = await (await pending).path();
  if (!path) throw new Error('Missing variant download');
  expect(
    (await readFile(path)).equals(
      Buffer.from(
        (await createVariantDataset(buildFixedVariant('V03', 'document')))
          .archive,
      ),
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Seed', { exact: true }).fill('Пример 🧩');
  await page
    .getByRole('button', { name: 'Собрать по seed', exact: true })
    .click();
  await expect(
    page.getByRole('status', { name: 'Состав варианта' }),
  ).toHaveText(
    'Вариант по seed: 16 заданий, максимум 21 балл. Выбрана работа №13.2.',
  );
  await expect(link).toHaveCount(0);
  await expect(page.locator('.variant-task')).toHaveCount(16);
});
test('variant development review is excluded from production', async ({
  page,
}) => {
  const response = await page.goto('./dev/variants/');
  expect(response?.status()).toBe(404);
});
