import { expect, test } from '../fixtures/security-browser';
import type { Page } from '@playwright/test';
import { first, link, ready, answer } from '../fixtures/stream-browser';
import { buildFixedVariant } from '../../src/core/variants';
import { PREFIX, areaSchemas } from '../../src/core/storage/schemas';

test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener(
      'touchstart',
      (event) => {
        if (event.isTrusted)
          document.documentElement.dataset.mobileTouches = String(
            Number(document.documentElement.dataset.mobileTouches ?? 0) + 1,
          );
      },
      { passive: true },
    );
  });
});

async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}
async function trustedTouches(page: Page) {
  expect(
    Number(await page.locator('html').getAttribute('data-mobile-touches')),
  ).toBeGreaterThan(2);
}

test('360px touch: answer, notes, rotation and the next task remain usable', async ({
  page,
}) => {
  await page.goto(link(first));
  await ready(page);
  const input = page.getByLabel('Твой ответ', { exact: true });
  const notes = page.getByLabel('Как я решал', { exact: true });
  await input.tap();
  await input.fill(answer(first, true));
  await notes.tap();
  await notes.fill('Проверил вычисление на телефоне.');
  const condition = page.locator('.task-card .rich-text');
  await expect(condition).toBeVisible();
  // DOM text includes MathML and stays independent of layout-inserted spaces.
  const statement = await condition.textContent();
  if (statement === null) throw new Error('The task condition is missing.');
  for (const viewport of [
    { width: 800, height: 360 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(input).toHaveValue(answer(first, true));
    await expect(notes).toHaveValue('Проверил вычисление на телефоне.');
    await expect(condition).toBeVisible();
    await expect(condition).toHaveText(statement);
    await fits(page);
  }
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .tap();
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .tap();
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 2');
  await expect(input).toHaveValue('');
  await fits(page);
  await trustedTouches(page);
});

test('360px touch: training autosaves and restores after rotation and reload', async ({
  page,
}) => {
  test.setTimeout(60000);
  const variant = buildFixedVariant('V01', 'document');
  const task = variant.tasks[0];
  if (!task || task.answer.type === 'artifact')
    throw new Error('No short answer in the first task.');
  await page.goto('variants/V01/');
  await page
    .getByRole('button', { name: 'Тренироваться без таймера', exact: true })
    .tap();
  await page.getByRole('radio', { name: '13.2 — Документ' }).tap();
  await page
    .getByRole('button', { name: 'Начать тренировку', exact: true })
    .tap();
  await page.getByLabel('Твой ответ', { exact: true }).fill(task.answer.value);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .tap();
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  const navigation = page.getByRole('navigation', {
    name: 'Задания тренировки',
  });
  await navigation.getByRole('button', { name: /^Задание №2,/u }).tap();
  const input = page.getByLabel('Твой ответ', { exact: true });
  await input.tap();
  await input.fill('Сохранённая запись');
  await page
    .getByLabel('Как я решал', { exact: true })
    .fill('Черновик после поворота.');
  await page.setViewportSize({ width: 800, height: 360 });
  await expect(input).toHaveValue('Сохранённая запись');
  await fits(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await fits(page);
  // Wait for the real ten-second autosave, with no clock or storage substitution.
  await expect
    .poll(
      async () => {
        const saved = areaSchemas.variantDraft.parse(
          await page.evaluate(
            (key): unknown => JSON.parse(localStorage.getItem(key) ?? 'null'),
            PREFIX + 'variantDraft',
          ),
        ).current;
        return saved?.answers.find((row) => row.taskNumber === 2)?.text;
      },
      { timeout: 15000 },
    )
    .toBe('Сохранённая запись');
  await trustedTouches(page);
  await page.reload();
  await page
    .getByRole('button', { name: 'Продолжить тренировку', exact: true })
    .tap();
  await expect(page.locator('#exam-task-title')).toHaveText('Задание №2');
  await expect(input).toHaveValue('Сохранённая запись');
  await expect(page.getByLabel('Как я решал', { exact: true })).toHaveValue(
    'Черновик после поворота.',
  );
  await navigation.getByRole('button', { name: /^Задание №1,/u }).tap();
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  await navigation.getByRole('button', { name: /^Задание №2,/u }).tap();
  await expect(input).toHaveValue('Сохранённая запись');
  await trustedTouches(page);
  await fits(page);
});
