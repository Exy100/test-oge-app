import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page: Page) {
  await page.goto('interactives/codes/');
  await expect(page.locator('astro-island:not([ssr]) .code-lab')).toBeVisible();
}
async function choose(page: Page, letter: string) {
  await page
    .getByRole('button', { name: new RegExp(`^Добавить ${letter},`) })
    .click();
}
test('code lab: keyboard walkthrough and undo preserve the original signal', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Разбор', exact: true }).click();
  const next = page.getByRole('button', {
    name: 'Следующий шаг →',
    exact: true,
  });
  await next.focus();
  await next.press('Enter');
  await expect(page.locator('.code-message strong')).toHaveText('А');
  await expect(next).toBeFocused();
  await page.getByRole('button', { name: '← Шаг назад', exact: true }).click();
  await expect(page.locator('.code-message strong')).toHaveText('…');
  for (let i = 0; i < 4; i++) await next.click();
  await expect(page.locator('.code-guide-answer')).toHaveText('Ответ: АБВА');
  await expect(page.locator('.code-success')).toContainText('0101100');
  await expect(next).toBeDisabled();
});
test('code lab: a locally valid dead branch can be explored and reversed', async ({
  page,
}) => {
  await open(page);
  await page.getByLabel('Что тренируем').selectOption('branches');
  await page.getByRole('button', { name: 'Вместе', exact: true }).click();
  await choose(page, 'Б');
  await expect(page.locator('.code-explanation')).toContainText('Вернись');
  await page.getByRole('button', { name: 'К развилке', exact: true }).click();
  await expect(page.locator('.code-message strong')).toHaveText('…');
  await expect(page.locator('.code-history')).toContainText('Б');
  for (const letter of 'АВА') await choose(page, letter);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('#code-feedback')).toHaveText(
    'Верно! Задача решена.',
  );
});
test('code lab: repeats are selected once; solo mode hides answers and resets between variants', async ({
  page,
}) => {
  await open(page);
  await page.getByLabel('Что тренируем').selectOption('repeats');
  await page.getByRole('button', { name: 'Вместе', exact: true }).click();
  for (const letter of 'АВАА') await choose(page, letter);
  await page
    .getByRole('group', { name: 'Буквы для ответа' })
    .getByRole('button', { name: 'А 3 раза' })
    .click();
  await expect(page.locator('.code-chunk[data-repeat=true]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('.code-success')).toBeVisible();
  await page
    .getByRole('button', { name: 'Самостоятельно', exact: true })
    .click();
  await expect(page.locator('.code-success')).toHaveCount(0);
  await expect(page.locator('.code-repeat-choices')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Подсказка', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Твой ответ').fill('АВАА');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('.code-success')).toHaveCount(0);
  await page.getByLabel('Твой ответ').fill('а');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('.code-success')).toBeVisible();
  await page
    .getByRole('button', { name: 'Следующий вариант →', exact: true })
    .click();
  await expect(page.getByLabel('Твой ответ')).toHaveValue('');
  await expect(page.locator('.code-source')).not.toContainText('01100');
});
test('code lab: reduced motion, themes and narrow screens remain accessible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('button', { name: 'Разбор', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Воспроизвести', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Следующий шаг →', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Включить плоский вид', exact: true })
    .click();
  await expect(page.locator('.code-stage')).toHaveAttribute(
    'data-flat',
    'true',
  );
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('combobox', { name: 'Тема', exact: true })
      .selectOption(theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
test('code lab: playback pauses and manual steps stay available', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Разбор', exact: true }).click();
  await page.locator('.code-stage').scrollIntoViewIfNeeded();
  await expect(page.locator('.code-stage')).toHaveAttribute(
    'data-reduced',
    'false',
  );
  await page.clock.install();
  await page
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await page.clock.fastForward(2400);
  await expect(page.locator('.code-message strong')).toHaveText('А');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.clock.fastForward(5000);
  await expect(page.locator('.code-message strong')).toHaveText('А');
  await page
    .getByRole('button', { name: 'Следующий шаг →', exact: true })
    .click();
  await expect(page.locator('.code-message strong')).toHaveText('АБ');
});

test('code lab: first visit allows direct choices and visible feedback', async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole('button', { name: 'Вместе', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await choose(page, 'Б');
  await expect(page.locator('.code-choice-notice')).toContainText(
    'не совпадает',
  );
  await expect(page.locator('.code-message strong')).toHaveText('…');
  await choose(page, 'А');
  await expect(page.locator('.code-choice-notice')).toContainText(
    'Добавлена буква А',
  );
  await expect(page.locator('.code-mini-state code')).toHaveText('101100');
  await expect(page.locator('.code-message strong')).toHaveText('А');
  await page.getByRole('button', { name: '← Шаг назад', exact: true }).click();
  await expect(page.locator('.code-message strong')).toHaveText('…');
});
test('code lab: drag or touch adds a letter to the signal', async ({
  page,
  isMobile,
}) => {
  await open(page);
  const card = page.getByRole('button', { name: /^Добавить А,/ });
  if (isMobile) await card.tap();
  else await card.dragTo(page.locator('.code-tape'));
  await expect(page.locator('.code-message strong')).toHaveText('А');
});
