import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page: Page, type: string) {
  await page.goto('interactives/memory/');
  await expect(
    page.locator('astro-island:not([ssr]) .memory-library'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Тип задачи про символы' })
    .getByRole('button', { name: new RegExp(type) })
    .click();
}
async function choose(page: Page, word: string) {
  await page
    .getByRole('group', { name: 'Слова исходного текста' })
    .getByRole('button', { name: word, exact: true })
    .click();
}
test('symbol practice: duplicate a word with one space and preserve punctuation', async ({
  page,
}) => {
  await open(page, 'Повтор в предложении');
  await expect(page.locator('.symbol-encoding')).toContainText(
    '16 бит = 2 байта',
  );
  await choose(page, 'пустые');
  await page.getByLabel('Один пробел').check();
  await page.getByLabel('Одна запятая').check();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-feedback')).toContainText(
    'Запятую учитывать не нужно',
  );
  await page.getByLabel('Одна запятая').uncheck();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-success')).toContainText('Ответ: пустые');
  await expect(page.locator('.symbol-byte-stack i')).toHaveCount(14);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Следующий шаг →' }).click();
  await expect(page.locator('.symbol-text-scene')).toContainText(
    'пустые пустые…',
  );
  await expect(page.locator('.symbol-text-scene')).toContainText(
    '7 × 2 = 14 байт',
  );
});
test('symbol practice: remove a word, test a wrong hypothesis, and reset solo state', async ({
  page,
}) => {
  await open(page, 'Удаление из предложения');
  await choose(page, 'Мой');
  await page.getByLabel('Один пробел').check();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-feedback')).toContainText('4 байта');
  await expect(page.locator('.symbol-success')).toHaveCount(0);
  await choose(page, 'дядя');
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-success')).toContainText('Ответ: дядя');
  await page
    .getByRole('button', { name: 'Самостоятельно', exact: true })
    .click();
  await expect(page.locator('.symbol-model')).toHaveCount(0);
  await expect(page.locator('.symbol-success')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сбросить выбор' }).click();
  await expect(page.locator('.symbol-selection')).toContainText(
    'ещё не выбрано',
  );
});
test('symbol practice: list repetition uses two separators and scenario counters are independent', async ({
  page,
}) => {
  await open(page, 'Повтор в списке');
  await choose(page, 'Попов');
  await page.getByLabel('Один пробел').check();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-feedback')).toContainText(
    'оба разделителя',
  );
  await page.getByLabel('Одна запятая').check();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await expect(page.locator('.symbol-success')).toContainText('Ответ: Попов');
  await page.getByRole('button', { name: 'Следующий пример →' }).click();
  await expect(page.locator('.memory-full-condition')).toContainText(
    'Пример 2',
  );
  await page
    .getByRole('navigation', { name: 'Тип задачи про символы' })
    .getByRole('button', { name: /Повтор в предложении/ })
    .click();
  await expect(page.locator('.memory-full-condition')).toContainText(
    'Пример 1',
  );
  await page
    .getByRole('navigation', { name: 'Тип задачи про символы' })
    .getByRole('button', { name: /Повтор в списке/ })
    .click();
  await expect(page.locator('.memory-full-condition')).toContainText(
    'Пример 2',
  );
});
test('symbol practice: themes, narrow screens, keyboard and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'Повтор в списке');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await choose(page, 'Попов');
    await page.getByLabel('Один пробел').check();
    await page.getByLabel('Одна запятая').check();
    await page.getByRole('button', { name: 'Проверить выбор' }).click();
    await expect(
      page.getByRole('button', { name: 'Воспроизвести' }),
    ).toBeDisabled();
    const next = page.getByRole('button', { name: 'Следующий шаг →' });
    await next.focus();
    await next.press('Enter');
    await expect(next).toBeFocused();
    expect(
      (await new AxeBuilder({ page }).include('main').analyze()).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
test('symbol practice: animation advances and pauses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, 'Повтор в предложении');
  await choose(page, 'пустые');
  await page.getByLabel('Один пробел').check();
  await page.getByRole('button', { name: 'Проверить выбор' }).click();
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect(page.locator('.symbol-proof')).toHaveAttribute('data-step', '1');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const step = await page.locator('.symbol-proof').getAttribute('data-step');
  await page.waitForTimeout(1100);
  await expect(page.locator('.symbol-proof')).toHaveAttribute(
    'data-step',
    step ?? '',
  );
});
