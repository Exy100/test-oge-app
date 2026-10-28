import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { buildFixedVariant } from '../../src/core/variants';
import { homeTask } from '../../src/lib/home-practice';
import { readyHome } from '../fixtures/home-browser';
import { PREFIX, areaSchemas } from '../../src/core/storage/schemas';
import { link, ready, current, stats } from '../fixtures/stream-browser';
import type { TaskInstance } from '../../src/core/types';
import { sitePath } from '../../src/lib/site';

const generator = generators.find((item) => item.id === 'numeral-sum-v2');
if (!generator) throw new Error('Missing numeral generator');
const task = generator.generate('ai-demo-ui');
if (task.answer.type !== 'integer') throw new Error('Expected integer answer');
const correct = task.answer.value;
const wrong = String(BigInt(correct) + 1n);

async function checked(
  page: Page,
  answer = correct,
  instance: TaskInstance = task,
) {
  await page.goto(link(instance));
  await ready(page);
  await expect(page.locator('.ai-panel')).toHaveCount(0);
  await page.getByLabel('Как я решал', { exact: true }).fill('Мой черновик');
  await page.getByLabel('Твой ответ', { exact: true }).fill(answer);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  const panel = page.locator('.ai-panel');
  await expect(panel).toContainText('Демонстрационный режим');
  return panel;
}

test('demo feedback streams locally, keeps the original score and remains accessible', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing base URL');
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  const api: string[] = [];
  const providers: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/u.test(url.protocol) && url.origin !== origin)
      external.push(url.href);
    if (url.pathname.includes('/api/')) api.push(url.pathname);
    if (url.pathname.includes('/demo-provider.')) providers.push(url.pathname);
  });
  const panel = await checked(page);
  const before = await stats(page);
  expect(providers).toEqual([]);
  await panel
    .getByRole('button', { name: 'Показать пример разбора', exact: true })
    .click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  const output = panel.getByRole('region', {
    name: 'Текст разбора',
    exact: true,
  });
  await expect(output).toContainText('Пример для верного ответа');
  await expect(output).toBeFocused();
  const lessons = panel.getByRole('navigation', {
    name: 'Материалы по теме задания №10',
  });
  await expect(lessons.getByRole('link')).toHaveCount(3);
  await expect(
    lessons.getByRole('link', {
      name: 'Перевод чисел: веса разрядов и остатки',
      exact: true,
    }),
  ).toHaveAttribute('href', sitePath('/materials/i9/base-conversion/'));
  await expect(
    panel.getByRole('link', { name: 'Решать задания №10', exact: true }),
  ).toHaveAttribute('href', sitePath('/stream/?numbers=10'));
  expect(await stats(page)).toEqual(before);
  await expect(page.getByLabel('Как я решал', { exact: true })).toHaveValue(
    'Мой черновик',
  );
  expect(external).toEqual([]);
  expect(api).toEqual([]);
  expect(providers.length).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    const accessibility = await new AxeBuilder({ page })
      .include('.ai-panel')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }
});

test('topic lessons and practice open by keyboard while the checked task and draft stay in their tab', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing base URL');
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  const api: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/u.test(url.protocol) && url.origin !== origin)
      external.push(url.href);
    if (url.pathname.includes('/api/')) api.push(url.pathname);
  });
  const generator = generators.find((item) => item.id === 'paths-diagram-v2');
  if (!generator) throw new Error('Missing directed-path generator');
  const instance = generator.generate('demo-lesson-paths');
  if (instance.answer.type !== 'integer')
    throw new Error('Expected integer answer');
  const answer = String(BigInt(instance.answer.value) + 1n);
  const panel = await checked(page, answer, instance);
  const before = await stats(page);
  const taskUrl = page.url();
  await expect(panel.getByRole('navigation')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Показать пример разбора' }).click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  const lessons = panel.getByRole('navigation', {
    name: 'Материалы по теме задания №9',
  });
  await expect(lessons.getByRole('link')).toHaveCount(1);
  const lesson = lessons.getByRole('link', {
    name: 'Считаем пути в направленной схеме',
    exact: true,
  });
  await expect(lesson).toHaveAttribute(
    'href',
    sitePath('/materials/i4/directed-paths/'),
  );
  await expect(lesson).toHaveAttribute('target', '_blank');
  await expect(lesson).toHaveAttribute('rel', 'noopener');
  await lesson.focus();
  const opened = context.waitForEvent('page');
  await lesson.press('Enter');
  const reading = await opened;
  await expect(reading.getByRole('heading', { level: 1 })).toHaveText(
    'Считаем пути в направленной схеме',
  );
  await expect(
    reading.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  await reading.close();
  expect(await stats(page)).toEqual(before);
  const practice = panel.getByRole('link', {
    name: 'Решать задания №9',
    exact: true,
  });
  await expect(practice).toHaveAttribute(
    'href',
    sitePath('/stream/?numbers=9'),
  );
  await expect(practice).toHaveAttribute('target', '_blank');
  await expect(practice).toHaveAttribute('rel', 'noopener');
  await practice.focus();
  const practicing = context.waitForEvent('page');
  await practice.press('Enter');
  const exercise = await practicing;
  await ready(exercise);
  await expect(
    exercise.getByRole('combobox', { name: 'Что решать', exact: true }),
  ).toHaveValue('9');
  await expect(
    exercise.getByRole('heading', { name: 'Задание №9', exact: true }),
  ).toBeVisible();
  // A filter link has no task/seed until a stream transition writes its URL.
  expect(await stats(exercise)).toEqual(before);
  await exercise
    .getByRole('button', { name: 'Пропустить задание', exact: true })
    .click();
  await ready(exercise);
  const next = current(exercise);
  expect(next.taskNumber).toBe(9);
  expect([next.generatorId, next.seed]).not.toEqual([
    instance.generatorId,
    instance.seed,
  ]);
  if (next.answer.type !== 'integer') throw new Error('Expected integer task');
  const skipped = await stats(exercise);
  expect(skipped.completed).toBe(before.completed + 1);
  expect(skipped.entries).toEqual(before.entries);
  await exercise
    .getByLabel('Твой ответ', { exact: true })
    .fill(next.answer.value);
  await exercise
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await expect(exercise.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  const after = await stats(exercise);
  expect(after.completed).toBe(skipped.completed + 1);
  const row = after.entries.find((entry) => entry.taskNumber === 9);
  expect(row).toMatchObject({ attempts: 2, correct: 1 });
  // Wait for shared counters before checking that their update kept the draft.
  await expect(page.locator('.progress-accuracy')).toHaveText('50%');
  await exercise.close();
  await expect(page).toHaveURL(taskUrl);
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    answer,
  );
  await expect(page.getByLabel('Как я решал', { exact: true })).toHaveValue(
    'Мой черновик',
  );
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'incorrect',
  );
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toContainText('Пример для неверного ответа');
  expect(await stats(page)).toEqual(after);
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  await ready(page);
  expect(current(page).taskNumber).toBe(9);
  expect(await stats(page)).toEqual(after);
  expect(external).toEqual([]);
  expect(api).toEqual([]);
});

test('stop, repeat and changed notes preserve the checked answer', async ({
  page,
}) => {
  const panel = await checked(page, wrong);
  const before = await stats(page);
  await panel
    .getByRole('button', { name: 'Показать пример разбора', exact: true })
    .click();
  const stop = panel.getByRole('button', {
    name: 'Остановить разбор',
    exact: true,
  });
  await stop.focus();
  await stop.press('Enter');
  await expect(panel.getByRole('status').first()).toContainText(
    'Разбор остановлен',
  );
  await expect(panel.getByRole('navigation')).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Повторить разбор', exact: true }),
  ).toBeFocused();
  await panel
    .getByRole('button', { name: 'Повторить разбор', exact: true })
    .click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toContainText('Пример для неверного ответа');
  await page
    .getByLabel('Как я решал', { exact: true })
    .fill('Изменённый черновик');
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toHaveCount(0);
  await expect(panel.getByRole('navigation')).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Показать пример разбора' }),
  ).toBeEnabled();
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'incorrect',
  );
  expect(await stats(page)).toEqual(before);
});

test('leaving a streaming task prevents old output from entering the next task', async ({
  page,
}) => {
  const panel = await checked(page);
  await panel.getByRole('button', { name: 'Показать пример разбора' }).click();
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  await ready(page);
  await expect(panel).toHaveCount(0);
  const next = current(page);
  if (next.answer.type !== 'integer')
    throw new Error('Expected next integer task');
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill(String(BigInt(next.answer.value) + 1n));
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await panel.getByRole('button', { name: 'Показать пример разбора' }).click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toContainText('Пример для неверного ответа');
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).not.toContainText('Пример для верного ответа');
});

for (const entry of ['demo-provider', 'feedback']) {
  test(`a failed ${entry} module can be retried without changing progress`, async ({
    page,
  }) => {
    let blocked = 0;
    const match = (url: URL) =>
      url.pathname.includes(`/${entry}.`) &&
      url.pathname.endsWith('.js') &&
      url.searchParams.has('load');
    await page.route(match, (route) => {
      blocked++;
      return route.abort('failed');
    });
    const panel = await checked(page);
    const before = await stats(page);
    await panel
      .getByRole('button', { name: 'Показать пример разбора' })
      .click();
    await expect(panel.getByRole('alert')).toContainText(
      'твой ответ и черновик сохранены',
    );
    await expect(panel.getByRole('navigation')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Попробовать ещё раз', exact: true }),
    ).toBeFocused();
    expect(blocked).toBeGreaterThan(0);
    await page.unroute(match);
    await panel
      .getByRole('button', { name: 'Попробовать ещё раз', exact: true })
      .click();
    await expect(panel.getByRole('status').first()).toHaveText(
      'Пример разбора готов.',
    );
    expect(await stats(page)).toEqual(before);
  });
}

test('training uses the same panel without editing saved answers or self-assessments', async ({
  page,
  context,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const first = buildFixedVariant('V01', 'document').tasks[0];
  if (!first || first.answer.type === 'artifact')
    throw new Error('Missing short task');
  await page.goto('variants/V01/');
  await page.getByRole('button', { name: 'Тренироваться без таймера' }).click();
  await page.getByRole('radio', { name: '13.2 — Документ' }).check();
  await page
    .getByRole('button', { name: 'Начать тренировку', exact: true })
    .click();
  await page.getByLabel('Твой ответ', { exact: true }).fill(first.answer.value);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  const saved = async () =>
    areaSchemas.variantDraft.parse(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
        PREFIX + 'variantDraft',
      ),
    ).current;
  const before = await saved();
  const panel = page.locator('.ai-panel');
  await panel.getByRole('button', { name: 'Показать пример разбора' }).click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  const opened = context.waitForEvent('page');
  await panel
    .getByRole('link', { name: 'Решать задания №1', exact: true })
    .click();
  const practice = await opened;
  await ready(practice);
  await expect(
    practice.getByRole('combobox', { name: 'Что решать', exact: true }),
  ).toHaveValue('1');
  await expect(
    practice.getByRole('heading', { name: 'Задание №1', exact: true }),
  ).toBeVisible();
  await practice.close();
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    first.answer.value,
  );
  expect((await saved())?.answers).toEqual(before?.answers);
  expect((await saved())?.assessments).toEqual(before?.assessments);
});

test('the home exercise shares the local example without changing its counter', async ({
  page,
}) => {
  const first = homeTask('volume', 0);
  if (first.answer.type === 'artifact')
    throw new Error('Expected short home task');
  await page.goto('./');
  await readyHome(page);
  await page.getByLabel('Твой ответ', { exact: true }).fill(first.answer.value);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await expect(page.getByTestId('solved-count')).toHaveText('1');
  const before = await stats(page);
  const panel = page.locator('.ai-panel');
  await panel.getByRole('button', { name: 'Показать пример разбора' }).click();
  await expect(panel.getByRole('status').first()).toHaveText(
    'Пример разбора готов.',
  );
  await expect(
    panel.getByRole('region', { name: 'Текст разбора' }),
  ).toContainText('Пример для верного ответа');
  expect(await stats(page)).toEqual(before);
  await expect(page.getByTestId('solved-count')).toHaveText('1');
});

test('practical work keeps its criteria and has no simulated grading', async ({
  page,
}) => {
  const python = generators.find(
    (item) => item.id === 'python-positive-mean-v1',
  );
  if (!python) throw new Error('Missing Python generator');
  await page.goto(link(python.generate('ai-demo-practical')));
  await ready(page);
  await expect(
    page.getByRole('heading', { name: 'Оцени свою работу', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ai-panel')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Сохранить самооценку', exact: true }),
  ).toBeDisabled();
});
