import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { areaSchemas, PREFIX } from '../../src/core/storage/schemas';
import { buildFixedVariant, VARIANT_VERSION } from '../../src/core/variants';
import { readZip } from '../../src/core/datasets/zip';
import { referenceProgram } from '../../src/core/generators/15/robots';
import { createExamDraft } from '../../src/core/variants/exam';
import legacyPrograms from '../fixtures/python-legacy-variants.json' with { type: 'json' };
import { isRobotKind } from '../../src/core/generators/15/fields';
import {
  isProgramKind,
  programCases,
  programParameters,
} from '../../src/core/generators/16/problems';

const fixed = buildFixedVariant('V01');
const first = fixed.tasks[0];
if (!first || first.answer.type === 'artifact')
  throw new Error('Missing short answer');
const correct = first.answer.value;
const draftKey = PREFIX + 'variantDraft',
  historyKey = PREFIX + 'variantAttempts';
test('old Python exam drafts retain their original №16 and saved source on resume', async ({
  page,
}) => {
  const draft = createExamDraft(
    {
      id: 'legacy-python-draft',
      variantId: 'V01',
      seed: 'informatics-variant-v1:V01',
      variant13: 'presentation',
    },
    Date.now(),
  );
  delete draft.pythonFormatVersion;
  draft.answers = [
    { taskNumber: 16, text: 'print("мой прежний код")\n', reasoning: '' },
  ];
  await page.addInitScript(
    ({ key, draft }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, current: draft }));
    },
    { key: draftKey, draft },
  );
  await page.goto('variants/V01/');
  await page
    .getByRole('button', { name: 'Пройти с таймером', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await number(page, 16).click();
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
    'print("мой прежний код")\n',
  );
  const legacy = legacyPrograms.find((item) => item.id === 'V01');
  if (!legacy) throw new Error('Missing original task');
  await expect(page.locator('.exam-task')).toContainText(
    legacy.task.statement.split('\n\n')[0] ?? '',
  );
});
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
    'Результат неполный',
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
  const heldExamLocks = () =>
    other.evaluate(async () => {
      const snapshot = await navigator.locks.query();
      return (
        snapshot.held?.filter(
          (lock) => lock.name === 'oge:informatics:variantDraft',
        ).length ?? 0
      );
    });
  await expect.poll(heldExamLocks).toBe(1);
  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  // WebKit can report page closure before releasing its native Web Lock.
  await expect.poll(heldExamLocks).toBe(0);
  await other
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await expect(other.getByRole('timer')).toBeVisible();
  await expect.poll(heldExamLocks).toBe(1);
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
    .getByLabel('Код Python', { exact: true })
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
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
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

test('exam: Robot runs from the keyboard, exports code and restores both programs after reload', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await start(page);
  await number(page, 15).click();
  const task = fixed.tasks.find((row) => row.taskNumber === 15);
  if (!task || !isRobotKind(task.subtype))
    throw new Error('Missing Robot task');
  const code = referenceProgram(task.subtype);
  const editor = page.getByLabel('Программа Робота', { exact: true });
  const status = page.getByRole('status', { name: 'Выполнение Робота' });
  await expect(
    page.getByLabel('Поле Робота', { exact: true }).locator('option'),
  ).toHaveCount(1);
  await editor.fill('нц 10000 раз\nзакрасить\nкц');
  await page.getByRole('button', { name: 'Запустить', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeDisabled();
  await page.getByRole('button', { name: 'Пауза', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeEnabled();
  await page.getByRole('button', { name: 'Сбросить выполнение' }).focus();
  await page.keyboard.press('Enter');
  await editor.fill(code);
  await editor.press('Tab');
  const exporter = page.getByRole('button', { name: 'Скачать свой код' });
  await expect(exporter).toBeFocused();
  const downloading = page.waitForEvent('download');
  await exporter.press('Enter');
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('answer.txt');
  const path = await download.path();
  if (!path) throw new Error('No Robot export');
  expect(await readFile(path, 'utf8')).toBe(code);
  await page.getByRole('button', { name: 'Шаг', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Шагов: 1.');
  await page.getByRole('button', { name: 'Запустить', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Все нужные клетки закрашены.', {
    timeout: 15000,
  });
  await expect(editor).toHaveValue(code);
  await page
    .getByLabel('Черновик решения')
    .fill('Проверить все допустимые длины стен.');
  await number(page, 16).click();
  const python = 'n = int(input())\nprint(n)\n';
  await page.getByLabel('Код Python', { exact: true }).fill(python);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Продолжить экзамен', exact: true })
    .click();
  await number(page, 15).click();
  await expect(editor).toHaveValue(code);
  await expect(status).toHaveText('Готов к запуску.');
  await expect(page.getByLabel('Черновик решения')).toHaveValue(
    'Проверить все допустимые длины стен.',
  );
  await number(page, 16).click();
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
    python,
  );
  await page
    .getByRole('button', { name: 'Завершить экзамен', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  for (const n of [15, 16]) {
    const review = page.locator('.exam-finished details').filter({
      has: page.getByRole('heading', {
        name: `Задание №${String(n)}`,
        exact: true,
      }),
    });
    await review.locator(':scope > summary').click();
    await expect(review.locator('.exam-saved-answer')).toHaveText(
      n === 15 ? code.trim() : python.trim(),
    );
    await review.getByRole('button', { name: 'Подготовить файлы' }).click();
    await expect(
      review.getByRole('link', { name: 'Скачать ZIP', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(
      review.getByLabel('Файл для просмотра').locator('option'),
    ).toContainText([
      n === 15 ? 'reference/answer.txt' : 'reference/answer.py',
    ]);
  }
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveCount(0);
  expect((await completed(page)).entries).toHaveLength(1);
});

test('exam: Python exports every saved character and exposes only the given input/output example', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await start(page);
  await number(page, 16).click();
  const task = fixed.tasks.find((row) => row.taskNumber === 16);
  if (!task || !isProgramKind(task.subtype))
    throw new Error('Missing Python task');
  const example = programCases(
    programParameters(task.subtype, task.seed),
    task.seed,
  )[0];
  if (!example) throw new Error('Missing example');
  await expect(
    page.getByLabel('Пример ввода и вывода').locator('option'),
  ).toHaveCount(1);
  await expect(
    page.getByRole('region', { name: 'Входные данные', exact: true }),
  ).toHaveText(example.input.trim());
  await expect(
    page.getByRole('region', { name: 'Ожидаемый результат', exact: true }),
  ).toHaveText(example.output.trim());
  await expect(
    page.getByRole('region', { name: 'Команда запуска Python' }),
  ).toHaveText('python3 answer.py');
  await expect(
    page.getByRole('button', { name: 'Подготовить файлы' }),
  ).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  const editor = page.getByLabel('Код Python', { exact: true });
  const code = '# Программа ученика\n' + '#'.repeat(19979) + '\n';
  expect(code.length).toBe(20000);
  await expect(editor).toHaveAttribute('maxlength', '20000');
  await editor.fill(code);
  await page.clock.install();
  await page.clock.runFor(10000);
  await expect(editor).toHaveValue(code);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать свой код' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe('answer.py');
  const path = await file.path();
  if (!path) throw new Error('No Python export');
  expect(await readFile(path, 'utf8')).toBe(code);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  expect(
    (await savedDraft(page))?.current?.answers.find(
      (row) => row.taskNumber === 16,
    )?.text,
  ).toBe(code);
  await number(page, 1).click();
  await number(page, 16).click();
  await expect(editor).toHaveValue(code);
});

test('exam: office criteria and file records follow the selected work without showing reference answers', async ({
  page,
}) => {
  await start(page, '13.1 — Презентация');
  for (const n of [13, 14]) {
    await number(page, n).click();
    const task = fixed.tasks.find((row) => row.taskNumber === n);
    if (!task?.criteria) throw new Error('Missing office rubric');
    const rubric = page.getByRole('group', { name: 'Учебные критерии работы' });
    for (const level of task.criteria.levels)
      await expect(rubric).toContainText(level.description);
    await page
      .getByLabel('Имя файла с твоей работой')
      .fill(n === 13 ? 'презентация.odp' : 'таблица.ods');
    await page.getByRole('button', { name: 'Подготовить файлы' }).click();
    await expect(
      page.getByRole('link', { name: 'Скачать ZIP', exact: true }),
    ).toBeVisible();
    const names = await page
      .getByLabel('Файл для просмотра')
      .locator('option')
      .allTextContents();
    expect(
      names.some((name) => /reference|criteria|answers|examples/u.test(name)),
    ).toBe(false);
  }
  await number(page, 13).click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue(
    'презентация.odp',
  );
  await page.getByRole('button', { name: 'Сменить работу №13' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Сменить работу', exact: true })
    .click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue('');
  await expect(page.locator('#exam-task-title')).toContainText(
    '13.2 — документ',
  );
  await expect(
    page.getByRole('group', { name: 'Учебные критерии работы' }),
  ).toContainText('0 балл(а).');
  await number(page, 14).click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue(
    'таблица.ods',
  );
});

test('exam: practical editors remain accessible in both themes with 200% text and reduced motion', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    for (const n of [13, 14, 15, 16]) {
      await number(page, n).click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
