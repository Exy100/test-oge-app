import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { figureExamples } from '../../src/dev/figure-examples';
import { describeFigure } from '../../src/core/figures/describe';

for (const theme of ['light', 'dark']) {
  test(`все рисунки: доступность и описание, ${theme}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/figures/');
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await expect(page.locator('.task-figure')).toHaveCount(27);
    for (const [index, spec] of figureExamples.entries()) {
      const figure = page.locator(`#example-${String(index)} .task-figure`);
      await figure.getByText('Текстовое описание', { exact: true }).click();
      await expect(figure.locator('.figure-description')).toHaveText(
        describeFigure(spec),
      );
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
test('рисунки не растягивают страницу при 360px и тексте 200%', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/figures/');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  const region = page.locator('.figure-scroll').nth(2);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('End');
});
test('рисунок разрядов есть на главной без JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto('https://127.0.0.1:4322/test-oge-app/');
  await expect(page.locator('[data-kind="place-value"]')).toBeVisible();
  await expect(page.locator('[data-kind="place-value"] th')).toHaveText([
    'Разряд',
    'Цифра',
    'Вес',
  ]);
  await context.close();
});

test('подписи схем не перекрываются и помещаются в свои рамки', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/figures/');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const violations = await page
    .locator('.figure-diagram')
    .evaluateAll((diagrams) => {
      const failures: string[] = [];
      for (const diagram of diagrams) {
        const labels = Array.from(diagram.querySelectorAll('[data-label]'));
        for (const [index, label] of labels.entries()) {
          const box = label.querySelector('rect')?.getBoundingClientRect();
          const text = label.querySelector('text')?.getBoundingClientRect();
          if (!box || !text) {
            failures.push('Нет рамки или текста');
            continue;
          }
          if (
            text.left < box.left ||
            text.right > box.right ||
            text.top < box.top ||
            text.bottom > box.bottom
          )
            failures.push(`Текст вне рамки: ${label.textContent}`);
          for (const other of labels.slice(index + 1)) {
            const next = other.querySelector('rect')?.getBoundingClientRect();
            if (
              next &&
              box.left < next.right &&
              box.right > next.left &&
              box.top < next.bottom &&
              box.bottom > next.top
            )
              failures.push(
                `Пересечение: ${label.textContent} / ${other.textContent}`,
              );
          }
        }
      }
      return failures;
    });
  expect(violations).toEqual([]);
});
