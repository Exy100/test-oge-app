import { expect, test } from '../fixtures/security-browser';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import {
  darkLargeText,
  expectPaper,
  interceptPrint,
  screenDetails,
} from '../fixtures/print-browser';
import { compact, provePdf } from '../fixtures/pdf-proof';
import { printedAttempt } from '../fixtures/printed-attempt';
import { PREFIX } from '../../src/core/storage/schemas';
import { fileMemo } from '../../src/core/variants/file-memo';

for (const lesson of preparationLessons) {
  test(`${lesson.id}: A4 cheatsheet and reference lesson preserve all visible text`, async ({
    page,
  }) => {
    await page.goto(`.${lesson.route}`);
    await darkLargeText(page);
    await page
      .locator('#example-1 > details[data-lesson-example] > summary')
      .click();
    const before = await screenDetails(page);
    await interceptPrint(page);
    const sheetButton = page.getByRole('button', {
      name: 'Распечатать шпаргалку',
    });
    await sheetButton.click();
    await page.emulateMedia({ media: 'print' });
    const article = page.locator('.lesson-page');
    await expectPaper(page, article, 'rgb(0, 0, 0)');
    await expect(page.locator('#theory')).toBeHidden();
    const sheet = await provePdf(page, article, `${lesson.id}-sheet`);
    expect(sheet.text).toContain(compact(lesson.title));
    await page.emulateMedia({ media: 'screen' });
    expect(await screenDetails(page)).toEqual(before);
    await expect(sheetButton).toBeFocused();
    await page
      .getByRole('button', { name: 'Распечатать урок', exact: true })
      .click();
    await page.emulateMedia({ media: 'print' });
    await expectPaper(page, article, 'rgb(0, 0, 0)');
    await expect(
      page.locator('#example-3 .lesson-steps > li').last(),
    ).toBeVisible();
    const reference = await provePdf(page, article, `${lesson.id}-reference`);
    expect(reference.text).toContain(compact(lesson.title));
    expect(reference.text).toContain(compact('Примеры по шагам'));
    await page.emulateMedia({ media: 'screen' });
    expect(await screenDetails(page)).toEqual(before);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-font-size', '200');
  });
}

test('the preparation map PDF contains all 45 lessons despite the screen filter', async ({
  page,
}) => {
  await page.goto('materials/?numbers=3');
  await darkLargeText(page);
  await interceptPrint(page);
  await page
    .getByRole('button', { name: 'Распечатать карту и список уроков' })
    .click();
  await page.emulateMedia({ media: 'print' });
  const pdf = await provePdf(
    page,
    page.locator('.materials-page'),
    'preparation-map',
  );
  for (const lesson of preparationLessons)
    expect(pdf.text).toContain(compact(lesson.title));
  await page.emulateMedia({ media: 'screen' });
  await expect(page).toHaveURL(/numbers=3$/u);
});

test('the file memo PDF preserves formats, limitations and unofficial status', async ({
  page,
}) => {
  await page.goto('variants/V01/');
  await page.locator('.variant-files > summary').click();
  await interceptPrint(page);
  await page
    .getByRole('button', { name: 'Распечатать памятку о файлах' })
    .click();
  await page.emulateMedia({ media: 'print' });
  const pdf = await provePdf(page, page.locator('.file-memo'), 'file-memo');
  expect(pdf.text).toContain(compact(fileMemo.introduction));
  expect(pdf.text).toContain(compact(fileMemo.limits));
  expect(pdf.text).not.toContain(compact('Пройти с таймером'));
});

for (const choice of ['document', 'presentation'] as const) {
  test(`${choice}: the saved result PDF preserves every task, answer, rubric and long code line`, async ({
    page,
  }) => {
    const attempt = printedAttempt(choice, choice === 'presentation');
    const key = PREFIX + 'variantAttempts';
    const saved = JSON.stringify({ version: 1, entries: [attempt] });
    await page.addInitScript(
      ({ key, saved }) => {
        localStorage.setItem(key, saved);
      },
      { key, saved },
    );
    await page.goto(`variants/V01/result/?attempt=${attempt.id}`);
    await darkLargeText(page);
    const prepare = page.getByRole('button', {
      name: 'Подготовить результат к печати',
    });
    await expect(prepare).toBeEnabled();
    const beforePrint = await page.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    await prepare.click();
    await expect(page.locator('.result-print-task')).toHaveCount(16);
    await page.emulateMedia({ media: 'print' });
    const content = page.locator('.result-print');
    await expectPaper(page, content);
    const pdf = await provePdf(page, content, `result-${choice}`);
    for (const number of Array.from({ length: 16 }, (_, index) => index + 1))
      expect(pdf.text).toContain(compact(`Задание №${String(number)}`));
    expect(pdf.text).toContain(
      compact(`Задание №13.${choice === 'presentation' ? '1' : '2'}`),
    );
    expect(pdf.text).toContain(compact('конец-длинной-строки'));
    expect(pdf.text).toContain(
      compact(choice === 'presentation' ? '21 из 21' : 'Результат неполный'),
    );
    expect(pdf.text).toContain(compact('Официальные баллы'));
    await page.emulateMedia({ media: 'screen' });
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
      beforePrint,
    );
  });
}
