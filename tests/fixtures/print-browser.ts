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
  const theme = page.getByLabel('Тема', { exact: true });
  await theme.selectOption('dark');
  await expect(theme).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Lazy islands must read the same persisted preference as the page shell.
  await page.evaluate(() => {
    const key = 'oge:informatics:v1:settings';
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        theme: 'dark',
        fontSize: 200,
        animations: true,
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-font-size', '200');
}

export async function expectPaper(
  page: Page,
  content: Locator,
  ink = 'rgb(17, 17, 17)',
) {
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  const pixels = (11 * 96) / 72;
  // Gecko quantizes the computed font size to FreeType's 1/64 CSS pixel grid.
  const expected =
    page.context().browser()?.browserType().name() === 'firefox'
      ? Math.round(pixels * 64) / 64
      : pixels;
  expect(
    await page
      .locator('html')
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
  ).toBeCloseTo(expected, 2);
  await expect(content).toHaveCSS('color', ink);
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
