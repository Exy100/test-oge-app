import { expect, test } from '../fixtures/security-browser';
import AxeBuilder from '@axe-core/playwright';
import {
  darkLargeText,
  expectPaper,
  interceptPrint,
  screenDetails,
} from '../fixtures/print-browser';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { fileMemo } from '../../src/core/variants/file-memo';

test('cheatsheet prints only its rules and lesson title, then restores focus and details', async ({
  page,
}) => {
  await page.goto('materials/i3/logic-operations/');
  await darkLargeText(page);
  await page
    .locator('#example-1 > details[data-lesson-example] > summary')
    .click();
  const before = await screenDetails(page);
  const button = page.getByRole('button', { name: 'Распечатать шпаргалку' });
  await interceptPrint(page);
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
  await page.emulateMedia({ media: 'print' });
  await expectPaper(page, page.locator('.lesson-page'), 'rgb(0, 0, 0)');
  await expect(page.locator('.lesson-header h1')).toBeVisible();
  await expect(page.locator('.lesson-cheatsheet > div')).toBeVisible();
  await expect(page.locator('#theory')).toBeHidden();
  await expect(page.locator('#examples')).toBeHidden();
  await expect(page.locator('.print-actions').first()).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Safari can emit afterprint while the print medium is still active.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('[data-print-selected]')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-print-selection',
  );
  expect(await screenDetails(page)).toEqual(before);
  await expect(button).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-font-size', '200');
  await page.evaluate(() => {
    window.print = () => {
      throw new Error('Print dialog unavailable');
    };
  });
  await button.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Не удалось открыть печать' }),
  ).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-print-selection',
  );
  expect(await screenDetails(page)).toEqual(before);
});

test('reference lesson print opens static explanations and restores every screen block', async ({
  page,
}) => {
  await page.goto('materials/i6/program-tracing/');
  await darkLargeText(page);
  await page
    .locator('#example-1 > details[data-lesson-example] > summary')
    .click();
  const before = await screenDetails(page);
  await interceptPrint(page);
  const button = page.getByRole('button', {
    name: 'Распечатать урок',
    exact: true,
  });
  await button.click();
  await page.emulateMedia({ media: 'print' });
  await expectPaper(page, page.locator('.lesson-page'), 'rgb(0, 0, 0)');
  await expect(page.locator('#theory')).toBeVisible();
  await expect(
    page.locator('#example-3 .lesson-steps > li').last(),
  ).toBeVisible();
  await expect(page.locator('.interactive-alternative > div')).toBeVisible();
  await expect(page.locator('.lesson-cheatsheet > div')).toBeVisible();
  await expect(page.locator('#quiz')).toBeHidden();
  await expect(page.locator('.interactive-screen')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#example-3 details')).toHaveAttribute('open', '');
  await page.emulateMedia({ media: 'screen' });
  expect(await screenDetails(page)).toEqual(before);
  await expect(button).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('file memo prints independently of variant tasks and retains exam limitations', async ({
  page,
}, info) => {
  await page.goto('variants/V01/');
  await page.locator('.variant-files > summary').click();
  const before = await screenDetails(page);
  await interceptPrint(page);
  const button = page.getByRole('button', {
    name: 'Распечатать памятку о файлах',
  });
  if (info.project.use.hasTouch === true) await button.tap();
  else await button.click();
  await page.emulateMedia({ media: 'print' });
  const memo = page.locator('.file-memo');
  await expectPaper(page, memo);
  await expect(memo).toContainText(fileMemo.introduction);
  await expect(memo).toContainText(fileMemo.limits);
  await expect(memo.locator('tbody tr')).toHaveCount(fileMemo.formats.length);
  await expect(page.locator('.variant-tasks')).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ media: 'screen' });
  expect(await screenDetails(page)).toEqual(before);
  await expect(page.locator('.variant-tasks')).toBeVisible();
  await expect(button).toBeFocused();
});

test('printed preparation map includes all lessons without changing the screen filter', async ({
  page,
}) => {
  await page.goto('materials/?numbers=3');
  await darkLargeText(page);
  const visible = await page.locator('.materials-topic:visible').count();
  expect(visible).toBeLessThan(14);
  await interceptPrint(page);
  await page
    .getByRole('button', { name: 'Распечатать карту и список уроков' })
    .click();
  await page.emulateMedia({ media: 'print' });
  await expectPaper(page, page.locator('.materials-page'));
  await expect(page.locator('.materials-topic:visible')).toHaveCount(14);
  await expect(page.locator('[data-material-lesson]:visible')).toHaveCount(
    preparationLessons.length,
  );
  await expect(page.locator('.materials-filter')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.materials-topic:visible')).toHaveCount(visible);
  await expect(page).toHaveURL(/numbers=3$/u);
});
