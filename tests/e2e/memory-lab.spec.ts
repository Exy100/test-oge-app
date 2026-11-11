import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openLab(page: Page) {
  await page.goto('interactives/memory/');
  await expect(
    page.locator('astro-island:not([ssr]) .memory-lab'),
  ).toBeVisible();
  return page.locator('.memory-lab');
}

async function answer(page: Page, value: string) {
  await page.locator('#memory-answer').fill(value);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
}

test('walkthrough conserves bytes and verifies removal from the original text', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const lab = await openLab(page);
  await expect(
    page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Интерактивные материалы' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(lab.locator('.memory-byte')).toHaveCount(14);
  const next = page.getByRole('button', { name: 'Следующий шаг', exact: true });
  await next.focus();
  await next.press('Enter');
  await expect(lab.locator('.memory-scene')).toHaveAttribute('data-phase', '1');
  await expect(lab).toHaveAttribute('aria-busy', 'false');
  await expect(next).toBeFocused();
  await expect(lab.locator('.memory-symbol')).toHaveCount(7);
  await page
    .getByRole('button', { name: 'Следующий шаг', exact: true })
    .click();
  await expect(lab.locator('.memory-byte[data-separator="true"]')).toHaveCount(
    4,
  );
  await expect(
    lab.locator('.memory-symbol[data-separator="true"]'),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Следующий шаг', exact: true })
    .click();
  await expect(lab.locator('.memory-equation')).toContainText('сосна');
  await page
    .getByRole('button', { name: 'Следующий шаг', exact: true })
    .click();
  await expect(lab.locator('.memory-equation')).toContainText(
    '(5 + 2) × 2 = 14 байт',
  );
  await expect(lab.locator('.memory-live-string')).toHaveAttribute(
    'aria-label',
    'После удаления: дуб, клён, берёза',
  );
  await expect(lab.locator('.memory-removed-token')).toHaveCount(7);
  await expect(
    page.getByRole('button', { name: 'Следующий шаг', exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test('guided answers unlock only the next step and diagnose both separator mistakes', async ({
  page,
}) => {
  const lab = await openLab(page);
  await page.getByRole('button', { name: 'Вместе', exact: true }).click();
  await expect(lab.locator('.memory-equation')).toHaveText(
    'Дано16 бит на символ',
  );
  await expect(
    page.getByRole('button', { name: 'Следующий шаг', exact: true }),
  ).toBeDisabled();
  await answer(page, '16');
  await expect(lab).toHaveAttribute('data-step', '0');
  await expect(page.locator('#memory-feedback')).toContainText(
    'Раздели 16 на 8',
  );
  await answer(page, '2');
  await expect(lab).toHaveAttribute('data-step', '1');
  await expect(lab.locator('.memory-scene')).toHaveAttribute('data-phase', '0');
  await expect(lab.locator('.memory-equation')).not.toContainText('14 ÷ 2 = 7');
  await answer(page, '7');
  await expect(lab.locator('.memory-scene')).toHaveAttribute('data-phase', '1');
  await expect(lab.locator('.memory-byte[data-separator="true"]')).toHaveCount(
    0,
  );
  await answer(page, '7');
  await expect(page.locator('#memory-feedback')).toContainText(
    'не входят в слово',
  );
  await answer(page, '6');
  await expect(page.locator('#memory-feedback')).toContainText(
    'и запятая, и пробел',
  );
  await answer(page, '5');
  await expect(lab.locator('.memory-scene')).toHaveAttribute('data-phase', '2');
  await expect(lab.locator('.memory-symbol[data-revealed="true"]')).toHaveCount(
    0,
  );
  await answer(page, 'клён');
  await expect(lab).toHaveAttribute('data-step', '3');
  await answer(page, ' СОСНА ');
  await expect(page.getByText('Задача решена!', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Следующий вариант', exact: true })
    .click();
  await expect(lab).toHaveAttribute('data-mode', 'together');
  await expect(lab).toHaveAttribute('data-step', '0');
  await expect(lab.locator('.memory-source')).not.toHaveText(
    'дуб, клён, сосна, берёза',
  );
});

test('independent mode keeps the solution hidden until a correct attempt', async ({
  page,
}) => {
  const lab = await openLab(page);
  await page
    .getByRole('button', { name: 'Самостоятельно', exact: true })
    .click();
  await expect(lab.locator('.memory-steps')).toHaveCount(0);
  await expect(lab.locator('.memory-symbol')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Следующий шаг', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'клён', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('#memory-feedback')).toContainText('не подходит');
  await expect(lab.locator('.memory-steps')).toHaveCount(0);
  await page.getByRole('button', { name: 'сосна', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(lab).toHaveAttribute('data-step', '4');
  await page
    .getByRole('button', { name: 'Новый вариант', exact: false })
    .click();
  await expect(lab).toHaveAttribute('data-mode', 'solo');
  await expect(lab.locator('.memory-steps')).toHaveCount(0);
});

test('playback pauses, responds to speed and preserves manual controls', async ({
  page,
}) => {
  const lab = await openLab(page);
  await page.locator('.memory-stage-card').scrollIntoViewIfNeeded();
  await expect(lab).toHaveAttribute('data-motion', 'true');
  await page.clock.install();
  await page
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await page.clock.fastForward(2700);
  await expect(lab).toHaveAttribute('data-step', '1');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.clock.fastForward(6000);
  await expect(lab).toHaveAttribute('data-step', '1');
  await expect(lab).toHaveAttribute('data-motion', 'false');
  await page
    .getByRole('button', { name: 'Следующий шаг', exact: true })
    .click();
  await expect(lab).toHaveAttribute('data-step', '2');
  await page
    .getByRole('combobox', { name: 'Скорость анимации' })
    .selectOption('1.5');
  await page
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await page.clock.fastForward(1800);
  await expect(lab).toHaveAttribute('data-step', '3');
  await page.clock.fastForward(1800);
  await expect(lab).toHaveAttribute('data-step', '4');
  await expect(lab).toHaveAttribute('data-playing', 'false');
});

test('reduced motion and the microscope preserve the actual task condition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lab = await openLab(page);
  await expect(
    page.getByRole('button', { name: 'Воспроизвести', exact: true }),
  ).toBeDisabled();
  await page.locator('.memory-microscope summary').click();
  await page.getByRole('button', { name: '32 бит', exact: true }).click();
  await expect(page.locator('.memory-micro-byte')).toHaveCount(4);
  await expect(page.locator('.memory-micro-byte i')).toHaveCount(32);
  await expect(page.locator('.memory-microscope-body')).toContainText(
    'по-прежнему 16 бит',
  );
  await expect(page.locator('.memory-facts')).toContainText('16 бит');
  await page.getByRole('button', { name: 'Объём', exact: true }).click();
  await expect(page.locator('.memory-scene')).toHaveAttribute(
    'data-flat',
    'true',
  );
  await page
    .getByRole('button', { name: 'Шаг 5: Проверяем удаление', exact: true })
    .click();
  await expect(lab).toHaveAttribute('data-step', '4');
  await expect
    .poll(() =>
      page
        .locator('.memory-removed-token')
        .evaluateAll((tokens) =>
          tokens.every((token) => token.getBoundingClientRect().width === 0),
        ),
    )
    .toBe(true);
});

test('leaving the scene pauses playback and the site animation preference applies immediately', async ({
  page,
}) => {
  const lab = await openLab(page);
  await page.locator('.memory-stage-card').scrollIntoViewIfNeeded();
  await page.clock.install();
  await page
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await page.clock.fastForward(2700);
  await expect(lab).toHaveAttribute('data-step', '1');
  // A short viewport can scroll the scene completely out of view on desktop too.
  await page.setViewportSize({
    width: page.viewportSize()?.width ?? 1280,
    height: 320,
  });
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(lab).toHaveAttribute('data-motion', 'false');
  await page.clock.fastForward(6000);
  await expect(lab).toHaveAttribute('data-step', '1');
  await page.evaluate(() => {
    document.documentElement.dataset.animations = 'off';
  });
  await expect(lab).toHaveAttribute('data-reduced', 'true');
  await page
    .getByRole('button', { name: 'Шаг 5: Проверяем удаление', exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator('.memory-removed-token')
        .evaluateAll((tokens) =>
          tokens.every((token) => token.getBoundingClientRect().width === 0),
        ),
    )
    .toBe(true);
});

test('light and dark themes remain accessible and fit the viewport', async ({
  page,
}) => {
  await openLab(page);
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('combobox', { name: 'Тема', exact: true })
      .selectOption(theme);
    await page
      .getByRole('button', { name: 'Шаг 4: Находим слово', exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
