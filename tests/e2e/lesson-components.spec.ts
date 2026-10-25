import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lessonTask } from '../../src/lib/lessons/content';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';

const url = 'http://127.0.0.1:4324/test-oge-app/dev/lessons/';

test('MDX renders metadata, contents, prerequisites and a working filtered practice link', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Как читать условие и проверять решение',
  );
  await expect(page.locator('.lesson-header')).toContainText('Чтение: 7 мин');
  const toc = page.getByRole('navigation', { name: 'Содержание урока' });
  await expect(toc.getByRole('link')).toHaveCount(7);
  for (const link of await toc.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    if (!href) throw new Error('Нет ссылки оглавления.');
    await expect(page.locator(href)).toHaveCount(1);
  }
  await toc.getByRole('link', { name: 'Теория' }).click();
  await expect(page).toHaveURL(url + '#theory');
  await expect(page.locator('.lesson-prerequisites a')).toHaveAttribute(
    'href',
    '/test-oge-app/dev/lessons/#theory',
  );
  await expect(page.locator('.lesson-nav a[rel="next"]')).toHaveAttribute(
    'href',
    '/test-oge-app/stream/?numbers=1,3',
  );
  await page.getByRole('link', { name: 'Перейти к заданиям' }).click();
  await expect(page).toHaveURL(/\/test-oge-app\/stream\/\?numbers=1%2C3/u);
  await expect(
    page.getByRole('heading', { name: /Задание №[13]/u }).first(),
  ).toBeVisible();
});

test('example reveals only the next step by keyboard and preserves opened steps', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const example = page.locator('#example-word');
  const summary = example.locator('summary');
  await expect(example.locator('[data-lesson-next]')).not.toHaveAttribute(
    'hidden',
  );
  await summary.focus();
  await summary.press('Enter');
  const steps = example.locator('.lesson-steps > li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toBeVisible();
  await expect(steps.nth(1)).toBeHidden();
  const next = example.getByRole('button', { name: 'Следующий шаг' });
  await next.focus();
  await next.press('Enter');
  await expect(steps.nth(1)).toBeFocused();
  await expect(steps.nth(2)).toBeHidden();
  await next.focus();
  await next.press('Enter');
  await expect(steps.nth(2)).toBeFocused();
  await expect(
    example.getByRole('button', { name: 'Все шаги открыты' }),
  ).toBeDisabled();
  await summary.click();
  await summary.click();
  await expect(steps.nth(2)).toBeVisible();
  expect(errors).toEqual([]);
});

test('short quiz checks format, rejects a wrong answer and accepts the independent solution', async ({
  page,
}) => {
  await page.goto(url);
  const question = page.locator('#question-word');
  const input = question.getByLabel('Твой ответ');
  await input.scrollIntoViewIfNeeded();
  const submit = question.getByRole('button', { name: 'Проверить ответ' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(question.getByRole('status').last()).toContainText(/ответ/u);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('ошибка');
  await input.press('Enter');
  await expect(question.locator('.lesson-feedback')).toHaveAttribute(
    'data-verdict',
    'incorrect',
  );
  const { task } = lessonTask({
    generatorId: 'removed-word-v2',
    taskNumber: 1,
    seed: 'lesson-components-word',
  });
  const answer = solveParameters(parseGeneratedProblem(task))?.[0];
  if (!answer) throw new Error('Нет независимого ответа.');
  await input.fill(answer);
  await expect(question.locator('.lesson-feedback')).not.toHaveAttribute(
    'data-verdict',
  );
  await input.press('Enter');
  await expect(question.locator('.lesson-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  await expect(page.locator('#question-logic input')).toHaveValue('');
});

test('choice quiz supports keyboard selection and correction without changing another answer', async ({
  page,
}) => {
  await page.goto(url);
  const question = page.locator('#question-file');
  await question.scrollIntoViewIfNeeded();
  const submit = question.getByRole('button', { name: 'Проверить ответ' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(question.getByRole('status')).toContainText(
    'Выбери один вариант',
  );
  const first = question.getByRole('radio').first();
  await first.focus();
  await first.press('Space');
  await submit.click();
  await expect(question.locator('.lesson-feedback')).toHaveAttribute(
    'data-verdict',
    'incorrect',
  );
  await first.focus();
  await first.press('ArrowDown');
  await expect(question.getByRole('radio').last()).toBeChecked();
  await submit.click();
  await expect(question.locator('.lesson-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  await expect(question.getByRole('status')).toContainText(
    'Открой сохранённый документ',
  );
});

test('theory, readable code, examples and cheatsheet work without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('#theory pre code')).toContainText(
      'bits_per_byte = 8',
    );
    const example = page.locator('#example-word');
    await example.locator('summary').click();
    for (const step of await example.locator('.lesson-steps > li').all())
      await expect(step).toBeVisible();
    await page.locator('.lesson-cheatsheet summary').click();
    await expect(page.locator('.lesson-cheatsheet')).toContainText(
      'один байт — восемь бит',
    );
    const notice = page.locator('noscript > p').first();
    await expect(notice).toContainText('включи JavaScript');
    await expect(notice).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a curated example prepares real source and reference files', async ({
  page,
}) => {
  await page.goto(url);
  const example = page.locator('#example-document');
  await example.scrollIntoViewIfNeeded();
  const prepare = example.getByRole('button', { name: 'Подготовить файлы' });
  await prepare.scrollIntoViewIfNeeded();
  await prepare.click();
  const zip = example.getByRole('link', { name: 'Скачать ZIP' });
  await expect(zip).toBeVisible();
  const download = page.waitForEvent('download');
  await zip.click();
  expect((await download).suggestedFilename()).toBe('document.zip');
  const options = await example
    .getByLabel('Файл для просмотра')
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => option.getAttribute('value')),
    );
  expect(options).toContain('source/material.odt');
  expect(options).toContain('reference/answer.odt');
});

test('printing reveals all solution steps and the closed cheatsheet', async ({
  page,
}) => {
  await page.goto(url);
  await expect(
    page.locator('#example-word [data-lesson-next]'),
  ).not.toHaveAttribute('hidden');
  await expect(page.locator('.lesson-cheatsheet > div')).toBeHidden();
  await page.locator('#example-word summary').click();
  await expect(page.locator('#example-word details')).toHaveAttribute('open');
  await page.getByLabel('Тема', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.lesson-page')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.task-files')).toBeHidden();
  await expect(page.locator('.lesson-cheatsheet > div')).toBeVisible();
  for (const step of await page
    .locator('#example-word .lesson-steps > li')
    .all())
    await expect(step).toBeVisible();
  await expect(page.locator('.lesson-toc')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.lesson-cheatsheet > div')).toBeHidden();
  await expect(page.locator('#example-word details')).toHaveAttribute('open');
});

test('both themes remain accessible with expanded help and quiz feedback at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.locator('#example-word summary').click();
  await page.locator('.lesson-cheatsheet summary').click();
  const question = page.locator('#question-file');
  await question.scrollIntoViewIfNeeded();
  await question.getByRole('radio').last().check();
  await question.getByRole('button', { name: 'Проверить ответ' }).click();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
