import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('separate interactive tab links lessons and supports steps, rearrangement and feedback', async ({
  page,
}) => {
  await page.goto('materials/i5/executor-check/');
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Интерактивные материалы' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Интерактивные материалы',
  );
  await page.getByRole('link', { name: 'Открыть практикум' }).click();
  const scene = page.locator('#executor-workshop');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByRole('button', { name: 'Шаг вперёд' })).toBeVisible();
  await scene.getByRole('button', { name: 'Шаг вперёд' }).press('Enter');
  await expect(
    scene.getByLabel('Текущее число: 4', { exact: true }),
  ).toBeVisible();
  await scene.getByRole('button', { name: 'Шаг назад' }).click();
  await expect(
    scene.getByLabel('Текущее число: 2', { exact: true }),
  ).toBeVisible();
  await scene.getByRole('button', { name: 'Проверить порядок' }).click();
  await expect(scene).toContainText('Получилось 18');
  await scene
    .getByRole('button', { name: 'Сдвинуть карточку 3 влево' })
    .press('Enter');
  await scene.getByRole('button', { name: 'Проверить порядок' }).click();
  await expect(scene).toContainText('Верно! 2 → 4 → 6 → 36.');
  await scene.getByRole('radio', { name: '20', exact: true }).check();
  await expect(scene).toContainText('Попробуй ещё');
  await scene.getByRole('radio', { name: '16', exact: true }).check();
  await expect(scene).toContainText('18 − 2 = 16');
  await expect(
    page.getByRole('link', { name: 'Проверка программы и ответа' }),
  ).toHaveAttribute('href', /materials\/i5\/executor-check\//u);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('reduced motion retains manual controls and card selection works without dragging', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('interactives/executor/');
  const scene = page.locator('#executor-workshop');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByRole('button', { name: 'Шаг вперёд' })).toBeVisible();
  await expect(
    scene.getByRole('button', { name: 'Воспроизвести', exact: true }),
  ).toHaveCount(0);
  await scene
    .getByRole('button', { name: 'Место 3: команда 2', exact: true })
    .click();
  await scene
    .getByRole('button', { name: 'Место 2: команда 1', exact: true })
    .click();
  await scene.getByRole('button', { name: 'Проверить порядок' }).click();
  await expect(scene).toContainText('Верно! 2 → 4 → 6 → 36.');
});

test('playback explains each step and dragging changes the program', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('interactives/executor/');
  const scene = page.locator('#executor-workshop');
  await scene.scrollIntoViewIfNeeded();
  await scene
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await expect(
    scene.getByLabel('Текущее число: 4', { exact: true }),
  ).toBeVisible();
  await scene
    .getByRole('button', { name: 'Остановить показ', exact: true })
    .click();
  await scene
    .getByRole('button', { name: 'Место 3: команда 2', exact: true })
    .dragTo(
      scene.getByRole('button', { name: 'Место 2: команда 1', exact: true }),
    );
  await scene.getByRole('button', { name: 'Проверить порядок' }).click();
  await expect(scene).toContainText('Верно! 2 → 4 → 6 → 36.');
});
