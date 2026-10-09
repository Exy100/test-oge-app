import { test, expect } from '@playwright/test';
import { figureExamples } from '../../src/dev/figure-examples';

for (const theme of ['light', 'dark']) {
  for (const [index, spec] of figureExamples.entries()) {
    test(`${theme} ${spec.kind} ${String(index)}`, async ({ page }) => {
      await page.goto('http://127.0.0.1:4324/test-oge-app/dev/figures/');
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(
        page.locator(`#example-${String(index)} .task-figure`),
      ).toHaveScreenshot(`${theme}-${spec.kind}-${String(index)}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.005,
      });
    });
  }
}
