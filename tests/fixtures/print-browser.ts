import { expect, type Locator, type Page } from '@playwright/test';

export async function interceptPrint(page: Page) {
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printCalls = String(
        Number(document.documentElement.dataset.printCalls ?? '0') + 1,
      );
    };
  });
}

export async function darkLargeText(page: Page) {
  await page.getByLabel('Тема', { exact: true }).selectOption('dark');
  await page.evaluate(() => {
    document.documentElement.dataset.fontSize = '200';
  });
}

export async function expectPaper(page: Page, content: Locator) {
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  expect(
    await page
      .locator('html')
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
  ).toBeCloseTo(14.6667, 2);
  await expect(content).toHaveCSS('color', 'rgb(17, 17, 17)');
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.site-footer')).toBeHidden();
}

export async function screenDetails(page: Page) {
  return page
    .locator(
      'details:not(.interactive-screen details):not(.lesson-question details)',
    )
    .evaluateAll((items) =>
      items.map((element) => {
        if (!(element instanceof HTMLDetailsElement))
          throw new Error('Ожидался раскрываемый блок.');
        return { id: element.id, open: element.open };
      }),
    );
}
