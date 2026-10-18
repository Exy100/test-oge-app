import { expect, type Page } from '@playwright/test';
export async function readyHome(page: Page) {
  await page.locator('.practice-layout').scrollIntoViewIfNeeded();
  await expect(page.locator('.exercise-card')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Твой ответ', { exact: true })).toBeEnabled();
}
