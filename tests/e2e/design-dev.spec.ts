import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('dev UI: обе темы, переходы Astro и сохранение выбора', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/ui/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Дизайн-система',
  );
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  // A window event and session marker distinguish a client swap from a reload.
  await page.evaluate(() => {
    sessionStorage.setItem('theme-at-swap', 'pending');
    document.addEventListener('astro:after-swap', () => {
      sessionStorage.setItem(
        'theme-at-swap',
        document.documentElement.dataset.theme ?? 'missing',
      );
    });
  });
  await page.getByRole('link', { name: 'Начать тренировку' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4324/test-oge-app/#practice');
  await expect(page.getByRole('button', { name: 'Проверить' })).toBeEnabled();
  expect(
    await page.evaluate(() => sessionStorage.getItem('theme-at-swap')),
  ).toBe('dark');
  await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('dark');
  await page.getByRole('link', { name: 'Дизайн-система', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Дизайн-система',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Тема', { exact: true }).selectOption('light');
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Проверить' })).toBeEnabled();
});
