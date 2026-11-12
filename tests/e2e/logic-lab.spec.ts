import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page: Page) {
  await page.goto('interactives/logic/');
  await expect(
    page.locator('astro-island:not([ssr]) .logic-lab'),
  ).toBeVisible();
}
test('logic lab: direct manipulation, boundary and keyboard trace', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.logic-explanation')).toContainText('подходит');
  await page.getByRole('button', { name: 'Уменьшить X' }).click();
  await expect(page.locator('.logic-explanation')).toContainText('не подходит');
  await page.getByLabel('Число X', { exact: true }).fill('99');
  await page.getByRole('button', { name: 'Подставить', exact: true }).click();
  await expect(page.locator('#logic-input-error')).toContainText('от 1 до 12');
  await page.getByLabel('Число X', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Подставить', exact: true }).click();
  await expect(page.locator('.logic-explanation')).toContainText('не подходит');
  const next = page.getByRole('button', { name: 'Следующий шаг →' });
  await next.focus();
  await next.press('Enter');
  await expect(page.locator('.logic-node[data-current=true]')).toHaveCount(1);
  await expect(next).toBeFocused();
  await next.click();
  await expect(page.locator('.logic-explanation')).toContainText('НЕ меняет');
});
test('logic lab: choose a solution set, fix missing boundary, clear and reset', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: /Собираем решения/ }).click();
  for (const x of [6, 7, 8])
    await page
      .getByRole('button', { name: `Число ${String(x)}`, exact: true })
      .click();
  await page.getByRole('button', { name: 'Проверить множество' }).click();
  await expect(page.locator('.logic-feedback')).toContainText(
    'Не хватает числа 5',
  );
  await page.getByRole('button', { name: 'Число 5', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить множество' }).click();
  await expect(page.locator('.logic-success')).toContainText('Ответ: 4');
  await page
    .getByRole('button', { name: 'Новый вариант', exact: false })
    .click();
  await expect(page.locator('.logic-success')).toHaveCount(0);
  await expect(page.locator('.logic-target')).toContainText('Ложь');
  await expect(page.locator('.logic-selection')).toContainText(
    'пока ни одного',
  );
});
test('logic lab: negation shows a counterexample and verifies every value', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: /Разбираемся с НЕ/ }).click();
  await page.getByRole('button', { name: 'Проверить преобразование' }).click();
  await expect(page.locator('.logic-counterexample')).toContainText('X = 0');
  await page.getByLabel('Левая часть: X').selectOption('≥');
  await page.getByLabel('Связка').selectOption('and');
  await page.getByLabel('Правая часть: X').selectOption('≤');
  await page.getByRole('button', { name: 'Проверить преобразование' }).click();
  await expect(page.locator('.logic-success')).toContainText('де Моргана');
});
test('logic lab: exam keeps answers hidden until success and handles false/minimum', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: /Решаем задание/ }).click();
  await expect(page.locator('[data-result]')).toHaveCount(0);
  await page.getByLabel('Твой ответ:').fill('5');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.locator('.logic-feedback')).toContainText('Пока неверно');
  await expect(page.locator('[data-result]')).toHaveCount(0);
  await page.getByLabel('Твой ответ:').fill('4');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.locator('.logic-success')).toContainText('Ответ: 4');
  await page.getByRole('button', { name: /Новый вариант/ }).click();
  await page.getByLabel('Твой ответ:').fill('5');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.locator('.logic-success')).toContainText('Ответ: 5');
});
test('logic lab: themes, reduced motion and all activities remain accessible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.getByRole('button', { name: '▷ Анимация' })).toBeDisabled();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    for (const name of [
      /Проверяем число/,
      /Собираем решения/,
      /Разбираемся с НЕ/,
      /Решаем задание/,
    ]) {
      await page.getByRole('button', { name }).click();
      expect(
        (await new AxeBuilder({ page }).include('.logic-lab').analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  }
});
test('logic lab: animation advances, pauses and can return to the full trace', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  await page.getByRole('button', { name: '▷ Анимация' }).click();
  await expect(page.locator('.logic-explanation')).toContainText('НЕ меняет');
  await page.getByRole('button', { name: 'Пауза' }).click();
  const before = await page.locator('.logic-explanation').textContent();
  await page.waitForTimeout(1100);
  await expect(page.locator('.logic-explanation')).toHaveText(before ?? '');
  await page.getByRole('button', { name: 'Все шаги', exact: true }).click();
  await expect(page.locator('.logic-node[data-pending=true]')).toHaveCount(0);
});
