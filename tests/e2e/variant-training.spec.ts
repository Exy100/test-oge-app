import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { PREFIX, areaSchemas } from '../../src/core/storage/schemas';
import { buildFixedVariant } from '../../src/core/variants';

const fixed = buildFixedVariant('V01');
const first = fixed.tasks[0];
if (!first || first.answer.type === 'artifact')
  throw new Error('Missing short answer');
const correct = first.answer.value;
const key = PREFIX + 'variantDraft';
async function start(page: Page, path = 'variants/V01/') {
  await page.goto(path);
  await page.getByRole('button', { name: 'Тренироваться без таймера' }).click();
  await page.getByRole('radio', { name: '13.2 — Документ' }).check();
  await page
    .getByRole('button', { name: 'Начать тренировку', exact: true })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Задания тренировки' }),
  ).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
}
function number(page: Page, value: number) {
  return page
    .getByRole('navigation', { name: 'Задания тренировки' })
    .getByRole('button', {
      name: new RegExp(`^Задание №${String(value)},`, 'u'),
    });
}
async function save(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
}
async function draft(page: Page) {
  return areaSchemas.variantDraft.parse(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
      key,
    ),
  ).current;
}

test('training checks immediately, retries, preserves notes and checked answers, and never expires', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.clock.install({ time: new Date('2026-10-21T10:00:00Z') });
  await start(page);
  const input = page.getByLabel('Твой ответ', { exact: true });
  const feedback = page.locator('.task-feedback');
  await input.press('Enter');
  await expect(feedback).toContainText('Попытка не засчитана');
  await expect(number(page, 1)).toHaveAttribute('data-filled', 'false');
  await input.fill('ошибка');
  await input.press('Enter');
  await expect(feedback).toContainText('Пока неверно');
  await page
    .getByRole('button', { name: 'Изменить работу и проверить снова' })
    .click();
  await expect(input).toBeFocused();
  await input.fill(correct);
  await page
    .getByLabel('Как я решал', { exact: true })
    .fill('Пересчитал объём удалённого слова.');
  await input.press('Enter');
  await expect(feedback).toContainText('Верно!');
  await page.getByRole('button', { name: 'Показать решение по шагам' }).click();
  await expect(page.getByRole('heading', { name: /^Шаг 1 из/u })).toBeVisible();
  await number(page, 2).click();
  await page.getByLabel('Твой ответ', { exact: true }).fill('черновая запись');
  await save(page);
  await page.clock.setSystemTime(new Date('2026-10-24T10:00:00Z'));
  await save(page);
  await expect(
    page.getByRole('navigation', { name: 'Задания тренировки' }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Продолжить тренировку', exact: true })
    .click();
  await expect(page.locator('#exam-task-title')).toHaveText('Задание №2');
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    'черновая запись',
  );
  await number(page, 1).click();
  await expect(feedback).toContainText('Верно!');
  await expect(page.getByLabel('Как я решал', { exact: true })).toHaveValue(
    'Пересчитал объём удалённого слова.',
  );
  expect(
    (await draft(page))?.answers.find((row) => row.taskNumber === 1)?.checked,
  ).toBe(true);
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('training restores office records, self-assessments and both programs, and editing invalidates a score', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await start(page);
  await number(page, 13).click();
  await page.getByLabel('Имя файла с твоей работой').fill('my.odt');
  await page.getByRole('radio', { name: /^0 балл/u }).check();
  await page.getByRole('button', { name: 'Сохранить самооценку' }).click();
  await expect(page.getByLabel('Результат самооценки')).toContainText('0 из 2');
  await number(page, 14).click();
  await page.getByLabel('Имя файла с твоей работой').fill('my.ods');
  await page.getByRole('radio', { name: /^3 балл/u }).check();
  await page.getByRole('button', { name: 'Сохранить самооценку' }).click();
  await number(page, 15).click();
  await expect(
    page.getByLabel('Поле Робота').locator('option'),
  ).not.toHaveCount(1);
  const robot = 'использовать Робот\nалг\nнач\nзакрасить\nкон';
  await page.getByLabel('Программа Робота', { exact: true }).fill(robot);
  await page.getByRole('radio', { name: /^1 балл/u }).check();
  await page.getByRole('button', { name: 'Сохранить самооценку' }).click();
  await page.getByLabel('Программа Робота', { exact: true }).fill(robot + '\n');
  await expect(page.getByLabel('Результат самооценки')).toBeEmpty();
  await expect(number(page, 15)).toHaveAttribute('data-filled', 'false');
  await number(page, 16).click();
  await expect(
    page.getByLabel('Пример ввода и вывода').locator('option'),
  ).not.toHaveCount(1);
  const code = '#'.repeat(19999) + '\n';
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveAttribute(
    'maxlength',
    '20000',
  );
  await page.getByLabel('Код Python', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Оставить без оценки' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать свой код' }).click();
  const file = await downloading;
  const path = await file.path();
  if (!path) throw new Error('Missing Python export');
  expect(await readFile(path, 'utf8')).toBe(code);
  await save(page);
  await page.reload();
  await page
    .getByRole('button', { name: 'Продолжить тренировку', exact: true })
    .click();
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
    code,
  );
  await expect(page.getByLabel('Результат самооценки')).toContainText(
    'без оценки',
  );
  await number(page, 15).click();
  await expect(
    page.getByLabel('Программа Робота', { exact: true }),
  ).toHaveValue(robot + '\n');
  await number(page, 13).click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue(
    'my.odt',
  );
  await expect(page.getByRole('radio', { name: /^0 балл/u })).toBeChecked();
  await page.getByRole('button', { name: 'Сменить работу №13' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Сменить работу', exact: true })
    .click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue('');
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await number(page, 14).click();
  await expect(page.getByLabel('Имя файла с твоей работой')).toHaveValue(
    'my.ods',
  );
  await expect(page.getByRole('radio', { name: /^3 балл/u })).toBeChecked();
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  const review = page.locator('.exam-finished details').filter({
    has: page.getByRole('heading', { name: 'Задание №14', exact: true }),
  });
  await review.locator(':scope > summary').click();
  await expect(review).toContainText('Сохранённая учебная оценка: 3 из 3.');
});

test('starting training preserves an unfinished exam until explicit replacement and enforces one writer', async ({
  page,
  context,
}) => {
  await page.goto('variants/V01/?exam=1');
  await page.getByRole('radio', { name: '13.2 — Документ' }).check();
  await page
    .getByRole('button', { name: 'Начать экзамен', exact: true })
    .click();
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill('Сохранить экзамен');
  await save(page);
  const before = await draft(page);
  const other = await context.newPage();
  await other.goto('variants/V01/?training=1');
  await other.getByRole('radio', { name: '13.2 — Документ' }).check();
  await other.getByRole('button', { name: 'Начать новую тренировку' }).click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Оставить работу' })
    .click();
  expect(await draft(other)).toEqual(before);
  await other.getByRole('button', { name: 'Начать новую тренировку' }).click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Заменить и начать' })
    .click();
  await expect(other.getByRole('alert')).toContainText('другой вкладке');
  expect(await draft(other)).toEqual(before);
  await page.close();
  await other.getByRole('button', { name: 'Начать новую тренировку' }).click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Заменить и начать' })
    .click();
  await expect(
    other.getByRole('navigation', { name: 'Задания тренировки' }),
  ).toBeVisible();
  expect((await draft(other))?.mode).toBe('training');
});

test('seeded training resumes from the catalogue, completes once and opens its saved review from history', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const seed = 'Тренировка + 🧩'.padEnd(200, 'я');
  await start(page, `variants/random/?${new URLSearchParams({ seed })}`);
  await number(page, 16).click();
  await page.getByLabel('Код Python', { exact: true }).fill('print(7)');
  await save(page);
  const id = (await draft(page))?.id;
  await page.goto('variants/');
  await page.getByRole('link', { name: 'Продолжить тренировку' }).click();
  await expect(page).toHaveURL(new RegExp('training=1', 'u'));
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
  await page
    .getByRole('button', { name: 'Продолжить тренировку', exact: true })
    .click();
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
    'print(7)',
  );
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Не проверены или не разобраны',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Завершить и открыть разбор' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Тренировка завершена' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Тренировка завершена' }),
  ).toBeVisible();
  await page.goto('variants/');
  const row = page.locator('.variant-history-table tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Тренировка');
  const link = row.getByRole('link');
  expect(
    new URL(
      (await link.getAttribute('href')) ?? '',
      page.url(),
    ).searchParams.get('training'),
  ).toBe(id);
  await link.click();
  await expect(
    page.getByRole('heading', { name: 'Тренировка завершена' }),
  ).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('training supports keyboard, help, practical criteria and editors in both themes at 200% text', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    for (const n of [1, 13, 15, 16]) {
      await number(page, n).focus();
      await page.keyboard.press('Enter');
      if (n === 1) {
        await page
          .getByRole('button', { name: /Открыть подсказку 1/u })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Подсказка 1 из 3', exact: true }),
        ).toBeVisible();
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
