import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { areaSchemas, PREFIX } from '../../src/core/storage/schemas';
import { buildFixedVariant, VARIANT_VERSION } from '../../src/core/variants';
import { readZip } from '../../src/core/datasets/zip';

const fixed = buildFixedVariant('V01');
const first = fixed.tasks[0];
if (!first || first.answer.type === 'artifact')
  throw new Error('Missing short answer');
const correct = first.answer.value;
const draftKey = PREFIX + 'variantDraft',
  historyKey = PREFIX + 'variantAttempts';
async function start(
  page: Page,
  choice = '13.2 — Документ',
  path = 'variants/V01/',
) {
  await page.goto(path);
  await page.getByRole('button', { name: 'Пройти с таймером' }).click();
  await expect(
    page.getByRole('button', { name: 'Начать экзамен', exact: true }),
  ).toBeDisabled();
  await page.getByRole('radio', { name: choice }).check();
  await page
    .getByRole('button', { name: 'Начать экзамен', exact: true })
    .click();
  await expect(page.getByRole('timer')).toContainText('02:');
}
function number(page: Page, n: number) {
  return page
    .getByRole('navigation', { name: 'Задания экзамена' })
    .getByRole('button', { name: new RegExp(`^Задание №${String(n)},`, 'u') });
}
async function savedDraft(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? 'null') as {
        current: {
          id: string;
          answers: { taskNumber: number; text: string; reasoning: string }[];
          marked: number[];
          variant13: string;
          seed: string;
          variantId: string;
        } | null;
      } | null,
    draftKey,
  );
}
async function completed(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}') as {
        entries: {
          id: string;
          answers: { text: string }[];
          score: number | null;
          elapsedMs: number;
          startedAt: string;
          finishedAt: string;
        }[];
      },
    historyKey,
  );
}

test('answers, notes, marks and the timer survive autosave, reload and visibility changes', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.clock.install({ time: new Date('2026-10-18T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T10:01:00Z'));
  await start(page);
  await expect(page.locator('.exam-navigation button')).toHaveCount(16);
  await expect(
    page.getByRole('button', {
      name: /подсказку|решение по шагам|Проверить ответ/u,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: /в практике/u })).toHaveCount(0);
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await page
    .getByLabel('Черновик решения')
    .fill('Сначала перевёл байты в биты.');
  await page.getByRole('button', { name: 'Отметить для возврата' }).click();
  await number(page, 2).click();
  await page.getByLabel('Твой ответ', { exact: true }).fill('АБВ');
  await page.clock.runFor(9000);
  expect((await savedDraft(page))?.current?.answers).toEqual([]);
  await page.clock.runFor(1000);
  expect((await savedDraft(page))?.current?.answers).toHaveLength(2);
  await page.reload();
  await page
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await number(page, 1).click();
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    correct,
  );
  await expect(page.getByLabel('Черновик решения')).toHaveValue(
    'Сначала перевёл байты в биты.',
  );
  await expect(number(page, 1)).toHaveAccessibleName(/отмечено для возврата/u);
  await expect(page.getByRole('timer')).toHaveText('02:29:50');
  await page.getByLabel('Твой ответ', { exact: true }).fill('новая запись');
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  expect(
    (await savedDraft(page))?.current?.answers.find(
      (row) => row.taskNumber === 1,
    )?.text,
  ).toBe('новая запись');
});

test('early completion lists unanswered and marked tasks, can be cancelled and opens a persisted review', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await page.getByRole('button', { name: 'Отметить для возврата' }).click();
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Без записи: №2, №3');
  await expect(dialog).toContainText('Отмечены для возврата: №1.');
  await dialog.getByRole('button', { name: 'Продолжить решать' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeFocused();
  await expect(page.locator('.exam-finished')).toContainText('1 из 12');
  await expect(page.locator('.exam-finished')).toContainText(
    'итоговый балл не выставлен',
  );
  const history = await completed(page);
  expect(history.entries).toHaveLength(1);
  expect(history.entries[0]?.score).toBeNull();
  expect((await savedDraft(page))?.current).toBeNull();
  await page
    .locator('.exam-finished .variant-task')
    .first()
    .locator(':scope > summary')
    .click();
  await expect(
    page.getByRole('button', { name: 'Открыть подсказку 1 из 3' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeVisible();
  expect((await completed(page)).entries).toHaveLength(1);
});

test('sleeping through the deadline submits once and keeps the last unsaved answer', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-18T10:00:00Z') });
  await start(page);
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await page.clock.setSystemTime(new Date('2026-10-18T13:30:00Z'));
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeVisible();
  const history = await completed(page),
    attempt = history.entries[0];
  expect(history.entries).toHaveLength(1);
  expect(attempt?.elapsedMs).toBe(9_000_000);
  expect(attempt?.answers[0]?.text).toBe(correct);
  expect(
    Date.parse(attempt?.finishedAt ?? '') -
      Date.parse(attempt?.startedAt ?? ''),
  ).toBe(9_000_000);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeVisible();
  expect((await completed(page)).entries).toHaveLength(1);
});

test('a second tab cannot overwrite an active exam and can resume when the first closes', async ({
  page,
  context,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await start(page);
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill('сохранить из первой вкладки');
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  const other = await context.newPage();
  await other.goto('variants/V01/?exam=1');
  await other
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await expect(other.getByRole('alert')).toContainText('другой вкладке');
  expect((await savedDraft(other))?.current?.answers[0]?.text).toBe(
    'сохранить из первой вкладки',
  );
  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  await other
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await expect(other.getByRole('timer')).toBeVisible();
  await number(other, 1).click();
  await expect(other.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    'сохранить из первой вкладки',
  );
});

test('external deletion stops the writer without losing its local answer', async ({
  page,
  context,
}) => {
  await start(page);
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill('мой несохранённый ответ');
  const other = await context.newPage();
  await other.goto('variants/');
  await other.evaluate((key) => {
    localStorage.removeItem(key);
  }, draftKey);
  await expect(
    page.getByRole('heading', { name: 'Запись в этой вкладке остановлена' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать мои ответы' }).click();
  const file = await (await download).path();
  if (!file) throw new Error('Download was not written');
  const exported = areaSchemas.variantDraft.parse({
    version: 1,
    current: JSON.parse(await readFile(file, 'utf8')) as unknown,
  });
  expect(exported.current?.answers[0]?.text).toBe('мой несохранённый ответ');
  expect(await savedDraft(other)).toEqual(null);
});

test('switching №13 requires confirmation, clears the old work and downloads source files only', async ({
  page,
}) => {
  await start(page, '13.1 — Презентация');
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await number(page, 13).click();
  await page.getByLabel('Имя файла с твоей работой').fill('мой-ответ.odp');
  await page.getByLabel('Черновик решения').fill('старый черновик');
  await page.getByRole('button', { name: 'Сменить работу №13' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Оставить выбранную' })
    .click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue(
    'мой-ответ.odp',
  );
  await page.getByRole('button', { name: 'Сменить работу №13' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Сменить работу', exact: true })
    .click();
  await expect(page.locator('#exam-task-title')).toContainText(
    '13.2 — документ',
  );
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue('');
  await expect(page.getByLabel('Черновик решения')).toHaveValue('');
  await page.getByRole('button', { name: 'Подготовить файлы' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Скачать ZIP', exact: true }).click();
  const file = await (await download).path();
  if (!file) throw new Error('Download was not written');
  const files = readZip(new Uint8Array(await readFile(file)));
  expect(files.has('source/material.odt')).toBe(true);
  expect(files.has('layout/sample.pdf')).toBe(true);
  expect(
    [...files.keys()].some((path) => /reference|criteria|examples/u.test(path)),
  ).toBe(false);
  await expect(
    page.getByRole('region', { name: 'Содержимое файла' }),
  ).not.toBeEmpty();
  await number(page, 1).click();
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    correct,
  );
});

test('a long random seed resumes from the catalogue after leaving with unsaved code', async ({
  page,
}) => {
  let warnings = 0;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') warnings += 1;
    return dialog.accept();
  });
  const seed = 'я'.repeat(200);
  await start(
    page,
    '13.2 — Документ',
    `variants/random/?${new URLSearchParams({ seed })}`,
  );
  await number(page, 16).click();
  await page
    .getByLabel('Твоя программа на Python')
    .fill('n = int(input())\nprint(n + 1)');
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Варианты', exact: true })
    .click();
  expect(warnings).toBeGreaterThan(0);
  await page
    .getByRole('link', { name: 'Продолжить экзамен', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await number(page, 16).click();
  await expect(page.getByLabel('Твоя программа на Python')).toHaveValue(
    'n = int(input())\nprint(n + 1)',
  );
  expect((await savedDraft(page))?.current?.variantId).toBe(
    `${VARIANT_VERSION}:${seed}`,
  );
  expect((await savedDraft(page))?.current?.seed).toBe(seed);
});

test('setup, running exam, dialogs and completion work with keyboard, themes, 200% text and axe', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('variants/V01/?exam=1');
  await expect(
    page.getByRole('heading', { name: 'Экзамен — 150 минут' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('radio', { name: '13.2 — Документ' }).focus();
  await page.keyboard.press('Space');
  await page
    .getByRole('button', { name: 'Начать экзамен', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await number(page, 9).click();
    await expect(page.locator('#exam-task-title')).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Завершить экзамен', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('blocked storage still allows an exam with a clear warning and downloadable answers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
  });
  await start(page);
  await expect(page.locator('.exam-run')).toContainText(
    'только в памяти этой страницы',
  );
  await page.getByLabel('Твой ответ', { exact: true }).fill(correct);
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  await expect(page.locator('.exam-finished')).toContainText('1 из 12');
  await expect(
    page.getByRole('button', { name: 'Скачать мои ответы' }),
  ).toBeVisible();
});

test('starting another variant only replaces the saved draft after explicit confirmation', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await start(page);
  await page.getByLabel('Твой ответ', { exact: true }).fill('старый ответ');
  await page.goto('variants/V02/');
  const previous = await savedDraft(page);
  await page.getByRole('button', { name: 'Пройти с таймером' }).click();
  await expect(
    page.getByRole('link', { name: 'Вернуться к незавершённому варианту' }),
  ).toHaveAttribute('href', /V01\/\?exam=1/u);
  await page.getByRole('radio', { name: '13.1 — Презентация' }).check();
  await page.getByRole('button', { name: 'Начать новый экзамен' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Оставить работу' })
    .click();
  expect((await savedDraft(page))?.current?.id).toBe(previous?.current?.id);
  expect((await savedDraft(page))?.current?.answers[0]?.text).toBe(
    'старый ответ',
  );
  await page.getByRole('button', { name: 'Начать новый экзамен' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Заменить и начать' })
    .click();
  await expect(page.getByRole('timer')).toBeVisible();
  expect((await savedDraft(page))?.current?.variantId).toBe('V02');
  expect((await savedDraft(page))?.current?.id).not.toBe(previous?.current?.id);
  expect((await savedDraft(page))?.current?.answers).toEqual([]);
  expect((await completed(page)).entries).toEqual([]);
});

test('failed exam module loading leaves the saved work untouched and explains recovery', async ({
  page,
}) => {
  await page.route(/\/ExamRun\.[^/]+\.js/u, (route) => route.abort());
  await page.goto('variants/V01/?exam=1');
  await page.getByRole('radio', { name: '13.2 — Документ' }).check();
  await page
    .getByRole('button', { name: 'Начать экзамен', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось загрузить задания',
  );
  await expect(page.getByRole('timer')).toHaveCount(0);
  expect((await savedDraft(page))?.current ?? null).toBeNull();
  expect((await completed(page)).entries).toEqual([]);
});
