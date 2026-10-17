import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import type { TaskInstance } from '../../src/core/types';

const first = generators
  .find((generator) => generator.taskNumber === 1)
  ?.generate('share & + # 🧩');
if (!first) throw new Error('Нет задания №1.');
function link(task: TaskInstance): string {
  return `stream/?${new URLSearchParams({ task: task.generatorId, seed: task.seed })}`;
}
async function filters(page: Page) {
  const panel = page.locator('.stream-filters');
  if (!(await panel.evaluate((element) => element.hasAttribute('open'))))
    await page.getByText('Фильтры заданий', { exact: true }).click();
  return panel;
}
async function apply(page: Page) {
  await page
    .getByRole('button', { name: 'Применить фильтры', exact: true })
    .click();
  await expect(page.getByLabel('Что решать')).toBeEnabled();
}
test('filters: multiple numbers, real difficulty, topic, URL reload and keyboard', async ({
  page,
}) => {
  await page.goto(link(first));
  await expect(page.getByLabel('Что решать')).toHaveValue('1');
  await filters(page);
  await page.getByRole('checkbox', { name: '№1', exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'Применить фильтры', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'Выбери хотя бы один номер',
  );
  await page.getByRole('checkbox', { name: '№1', exact: true }).check();
  await page.getByRole('checkbox', { name: '№2', exact: true }).check();
  await page.getByRole('checkbox', { name: '№11', exact: true }).check();
  await page
    .getByLabel('Тема задания', { exact: true })
    .selectOption('Кодирование');
  const sample = generators
    .find((generator) => generator.taskNumber === 2)
    ?.generate('difficulty-sample');
  if (!sample) throw new Error('Нет №2.');
  await page
    .getByLabel('Сложность задания', { exact: true })
    .selectOption(String(sample.difficulty));
  await page
    .getByRole('button', { name: 'Применить фильтры', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Задание №2', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.task-card .eyebrow')).toContainText(
    `Сложность ${String(sample.difficulty)} из 3`,
  );
  await expect(page.locator('.stream-filter-summary')).toContainText(
    'Номера: 1, 2, 11',
  );
  await expect(
    page.getByText('Для №1, №11 не подобраны', { exact: false }),
  ).toBeVisible();
  const search = new URL(page.url()).searchParams;
  expect(search.get('numbers')).toBe('1,2,11');
  expect(search.get('topic')).toBe('Кодирование');
  const statement = await page.locator('.task-card .rich-text').innerText();
  const address = page.url();
  await page.reload();
  await expect(page.locator('.task-card .rich-text')).toHaveText(statement);
  await expect(page.getByLabel('Что решать')).toContainText(
    'Выбранные номера: 1, 2, 11',
  );
  await filters(page);
  await expect(
    page.getByRole('checkbox', { name: '№11', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel('Сложность задания', { exact: true }),
  ).toHaveValue(String(sample.difficulty));
  expect(page.url()).toBe(address);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('filters: empty difficulty has no substitute task; retry and recovery work', async ({
  page,
}) => {
  const document = bankTasks.find((task) => task.variant13 === 'document');
  if (!document) throw new Error('Нет документа.');
  await page.goto(link(document));
  await expect(page.getByLabel('Что решать')).toHaveValue('13.2');
  await filters(page);
  await page.getByLabel('Сложность задания', { exact: true }).selectOption('1');
  await apply(page);
  await expect(page.locator('.task-card')).toHaveCount(0);
  await expect(page.locator('.stream-empty')).toContainText(
    'Не удалось подобрать задание',
  );
  await page.getByRole('button', { name: 'Повторить подбор' }).click();
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.getByLabel('Сложность задания', { exact: true }).selectOption('0');
  await page
    .getByLabel('Вид работы №13', { exact: true })
    .selectOption('presentation');
  await apply(page);
  await expect(
    page.getByRole('heading', {
      name: 'Задание №13.1 — презентация',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Задание №13.1 — презентация',
      exact: true,
    }),
  ).toBeVisible();
});
for (const kind of ['generated', 'curated'] as const) {
  test(`filters: copied ${kind} link reproduces exact condition and ZIP with clipboard denied`, async ({
    page,
  }) => {
    const task =
      kind === 'curated'
        ? bankTasks.find((entry) => entry.variant13 === 'document')
        : generators
            .find((generator) => generator.taskNumber === 14)
            ?.generate('file link & + 🧩');
    if (!task) throw new Error('Нет файлового задания.');
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await page.goto(link(task));
    await expect(page.getByLabel('Что решать')).toHaveValue(
      kind === 'curated' ? '13.2' : '14',
    );
    const original = await page.locator('.task-card .rich-text').innerText();
    await page
      .getByRole('button', { name: 'Скопировать ссылку на задачу' })
      .click();
    const manual = page.getByLabel('Ссылка на задачу', { exact: true });
    await expect(manual).toBeVisible();
    const url = await manual.inputValue();
    expect(new URL(url).pathname).toBe('/test-oge-app/stream/');
    expect(new URL(url).searchParams.get('seed')).toBe(task.seed);
    await page.goto(url);
    await expect(page.getByLabel('Что решать')).toHaveValue(
      kind === 'curated' ? '13.2' : '14',
    );
    await expect(page.locator('.task-card .rich-text')).toHaveText(original);
    await page
      .getByRole('button', { name: 'Подготовить файлы', exact: true })
      .click();
    const zip = page.getByRole('link', { name: 'Скачать ZIP', exact: true });
    await expect(zip).toBeVisible();
    const download = page.waitForEvent('download');
    await zip.click();
    const path = await (await download).path();
    if (!path) throw new Error('Нет архива.');
    const expected = await createTaskDataset(task);
    expect(
      Buffer.from(await readFile(path)).equals(Buffer.from(expected.archive)),
    ).toBe(true);
  });
}
test('filters: successful copy writes a valid link and history restores filters both ways', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          Reflect.set(window, 'copiedTask', text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(link(first));
  await expect(page.getByLabel('Что решать')).toHaveValue('1');
  const before = page.url();
  await page.getByLabel('Что решать').selectOption('2');
  await expect(
    page.getByRole('heading', { name: 'Задание №2', exact: true }),
  ).toBeVisible();
  const after = page.url();
  await page
    .getByRole('button', { name: 'Скопировать ссылку на задачу' })
    .click();
  await expect(page.getByRole('status').last()).toHaveText(
    'Ссылка скопирована.',
  );
  expect(
    await page.evaluate(() => Reflect.get(window, 'copiedTask') as string),
  ).toBe(after);
  await page.goBack();
  await expect(page.getByLabel('Что решать')).toHaveValue('1');
  await expect(page).toHaveURL(before);
  await page.goForward();
  await expect(page.getByLabel('Что решать')).toHaveValue('2');
  await expect(page).toHaveURL(after);
});
test('filters: review-only displays an empty queue and waiting intervals without inventing attempts', async ({
  page,
}) => {
  await page.goto(link(first));
  await expect(page.getByLabel('Что решать')).toHaveValue('1');
  await filters(page);
  await page
    .getByRole('checkbox', { name: 'Только повторение ошибок', exact: true })
    .check();
  await apply(page);
  await expect(page.locator('.stream-empty')).toContainText('нет ошибок');
  await page
    .getByRole('checkbox', { name: 'Только повторение ошибок', exact: true })
    .uncheck();
  await apply(page);
  await expect(page.getByLabel('Твой ответ', { exact: true })).toBeVisible();
  await page.getByLabel('Твой ответ', { exact: true }).fill('-99999999');
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Только повторение ошибок', exact: true })
    .check();
  await apply(page);
  await expect(page.locator('.stream-empty')).toContainText(
    'после ещё 3 других заданий',
  );
  await page.reload();
  await expect(page.locator('.stream-empty')).toContainText('нет ошибок');
});
test('filters: due error is reproduced after three other tasks and matches review filter', async ({
  page,
}) => {
  await page.goto(link(first));
  await expect(page.getByLabel('Что решать')).toHaveValue('1');
  const original = await page.locator('.task-card .rich-text').innerText();
  await page.getByLabel('Твой ответ', { exact: true }).fill('-99999999');
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  for (let index = 0; index < 3; index += 1) {
    await page
      .getByRole('button', { name: 'Пропустить задание', exact: true })
      .click();
    await expect(page.getByLabel('Что решать')).toBeEnabled();
  }
  await expect(page.locator('.stream-position')).toContainText('повторение');
  await expect(page.locator('.task-card .rich-text')).toHaveText(original);
  await expect(page.locator('.stream-position')).toHaveText(
    'Задание 5 · повторение',
  );
  await filters(page);
  await page
    .getByRole('checkbox', { name: 'Только повторение ошибок', exact: true })
    .check();
  await apply(page);
  await expect(page.locator('.stream-position')).toHaveText(
    'Задание 5 · повторение',
  );
  await expect(page.locator('.task-card .rich-text')).toHaveText(original);
});
test('filters: invalid link is explained, no execution or injected markup, filter recovers', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('stream/?task=%3Cscript%3Ealert(1)%3C%2Fscript%3E&seed=a');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось открыть ссылку',
  );
  await page.getByLabel('Что решать').selectOption('3');
  await expect(
    page.getByRole('heading', { name: 'Задание №3', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('filters: failure during apply preserves URL, draft, task, answer and statistics', async ({
  page,
}) => {
  await page.goto('stream/');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  const before = page.url();
  await page.getByLabel('Твой ответ', { exact: true }).fill('32');
  await page.getByLabel('Как я решал').fill('Сохранённый черновик');
  const statement = await page.locator('.task-card .rich-text').innerText();
  await filters(page);
  await page.getByLabel('Сложность задания', { exact: true }).selectOption('3');
  await page.route('**/_astro/*.js', (route) => route.abort());
  await apply(page);
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось подготовить задание',
  );
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    '32',
  );
  await expect(page.getByLabel('Как я решал')).toHaveValue(
    'Сохранённый черновик',
  );
  await expect(page.locator('.task-card .rich-text')).toHaveText(statement);
  await expect(
    page.getByLabel('Сложность задания', { exact: true }),
  ).toHaveValue('3');
  expect(page.url()).toBe(before);
  await expect(page.locator('.stream-position')).toHaveText('Задание 1');
});

test('filters: Back to the bare practice URL restores the original task', async ({
  page,
}) => {
  await page.goto('stream/');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  const statement = await page.locator('.task-card .rich-text').innerText();
  const before = page.url();
  await page.getByLabel('Что решать').selectOption('13.2');
  await expect(page.getByLabel('Что решать')).toHaveValue('13.2');
  await page.goBack();
  await expect(page).toHaveURL(before);
  await expect(page.locator('.task-card .rich-text')).toHaveText(statement);
  await expect(page.getByLabel('Что решать')).toHaveValue('short');
});
