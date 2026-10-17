import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import { defaults, PREFIX } from '../../src/core/storage/schemas';

const task = generators
  .filter((item) => item.taskNumber === 10)
  .map((item) => item.generate('progress-browser'))
  .find((item) => item.answer.type === 'integer');
if (!task || task.answer.type !== 'integer')
  throw new Error('Нет целочисленного задания №10.');
const answer = task.answer.value;
const path = `stream/?${new URLSearchParams({ task: task.generatorId, seed: task.seed })}`;
async function open(page: Page) {
  await page.goto(path);
  await expect(page.getByLabel('Что решать')).toHaveValue('10');
}
async function submit(page: Page, raw = answer) {
  await page.getByLabel('Твой ответ', { exact: true }).fill(raw);
  await page
    .getByRole('button', { name: 'Проверить ответ', exact: true })
    .click();
}
test('result survives reload before Next; progress is shared with home and is not counted twice', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('.progress-accuracy')).toHaveText('Нет оценок');
  await submit(page, 'не число');
  await expect(page.locator('.progress-accuracy')).toHaveText('Нет оценок');
  await submit(page);
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  await expect(page.locator('.progress-streak')).toHaveText('1');
  await expect(page.locator('.stream-progress')).toContainText('Верно 1 из 1');
  await page
    .getByRole('button', { name: 'Следующее задание', exact: true })
    .click();
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  await expect(page.locator('.stream-progress')).toContainText('Верно 1 из 1');
  await page.goto(path);
  await expect(page.getByLabel('Что решать')).toHaveValue('10');
  await submit(page, '-99999999');
  await expect(page.locator('.progress-streak')).toHaveText('0');
  await page.reload();
  await expect(page.locator('.progress-accuracy')).toHaveText('50%');
  await expect(page.locator('.stream-progress')).toContainText('Верно 1 из 2');
  await expect(page.locator('.progress-reviews')).toHaveText('1');
  await page.goto('./');
  await expect(page.locator('.stream-progress')).toContainText('Верно 1 из 2');
  await page.reload();
  await expect(page.locator('.progress-accuracy')).toHaveText('50%');
  expect(errors).toEqual([]);
});
test('practical self-assessment persists separately; an unassessed task invents no accuracy', async ({
  page,
}) => {
  const practical = bankTasks.find((item) => item.variant13 === 'presentation');
  if (!practical) throw new Error('Нет презентации.');
  const url = `stream/?${new URLSearchParams({ task: practical.generatorId, seed: practical.seed })}`;
  await page.goto(url);
  await expect(page.getByLabel('Что решать')).toHaveValue('13.1');
  await page
    .getByRole('button', { name: 'Оставить без оценки', exact: true })
    .click();
  await expect(page.locator('.progress-self')).toHaveText('0');
  await page.goto(url);
  await expect(page.getByLabel('Что решать')).toHaveValue('13.1');
  await page.getByRole('radio').nth(1).check();
  await page
    .getByRole('button', { name: 'Сохранить самооценку', exact: true })
    .click();
  await expect(page.locator('.progress-self')).toHaveText('1');
  await expect(page.locator('.progress-accuracy')).toHaveText('Нет оценок');
  const cell = page.locator('.progress-map li').nth(12);
  await expect(cell).toContainText('50%');
  await page.reload();
  await expect(page.locator('.progress-self')).toHaveText('1');
  await expect(cell).toContainText('50%');
});
test('reset from Settings updates open stream and home tabs and cannot resurrect an old result', async ({
  page,
  context,
}) => {
  await open(page);
  await submit(page, '-99999999');
  await expect(page.locator('.progress-reviews')).toHaveText('1');
  const home = await context.newPage();
  await home.goto('./');
  await expect(home.locator('.progress-reviews')).toHaveText('1');
  const settings = await context.newPage();
  await settings.goto('settings/');
  await settings
    .getByRole('button', { name: 'Удалить все данные проекта' })
    .click();
  await settings.getByRole('button', { name: 'Подтвердить удаление' }).click();
  for (const tab of [page, home]) {
    await expect(tab.locator('.progress-accuracy')).toHaveText('Нет оценок');
    await expect(tab.locator('.progress-streak')).toHaveText('0');
    await expect(tab.locator('.progress-reviews')).toHaveText('0');
  }
  await page
    .getByRole('button', { name: 'Пропустить задание', exact: true })
    .click();
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  await page.reload();
  await expect(page.locator('.progress-reviews')).toHaveText('0');
  await expect(page.locator('.progress-accuracy')).toHaveText('Нет оценок');
});
test('Settings export and import restore real counters, series and queue', async ({
  page,
}) => {
  await open(page);
  await submit(page);
  await page.goto('settings/');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать данные' }).click();
  const download = await waiting;
  const exported = await download.path();
  await page
    .getByRole('button', { name: 'Удалить все данные проекта' })
    .click();
  await page.getByRole('button', { name: 'Подтвердить удаление' }).click();
  await page.getByLabel('Импортировать JSON, до 2 МБ').setInputFiles(exported);
  await page
    .getByRole('button', { name: 'Заменить данные', exact: true })
    .click();
  await page.goto(path);
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  await expect(page.locator('.progress-streak')).toHaveText('1');
});
for (const failure of ['blocked', 'quota', 'corrupt']) {
  test(`progress remains usable with ${failure} storage`, async ({ page }) => {
    await page.addInitScript(
      ({ failure, key }) => {
        if (failure === 'corrupt') localStorage.setItem(key, '{broken');
        else if (failure === 'blocked')
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Blocked', 'SecurityError');
            },
          });
        else
          Storage.prototype.setItem = () => {
            throw new DOMException('Full', 'QuotaExceededError');
          };
      },
      { failure, key: PREFIX + 'streamStats' },
    );
    await open(page);
    await submit(page);
    await expect(page.locator('.progress-accuracy')).toHaveText('100%');
    await expect(page.locator('#storage-notice')).toBeVisible();
    await page
      .getByRole('button', { name: 'Следующее задание', exact: true })
      .click();
    await expect(page.getByLabel('Что решать')).toBeEnabled();
    await expect(page.locator('.stream-progress')).toContainText(
      'Верно 1 из 1',
    );
  });
}
test('16-number map works with keyboard, both themes, reduced motion and 200% text', async ({
  page,
}) => {
  const stats = defaults().streamStats;
  stats.entries = [0, 0.5, 1].map((accuracy, index) => ({
    taskNumber: (index + 1) as 1 | 2 | 3,
    attempts: 2,
    correct: accuracy * 2,
    self: { attempts: 0, credit: 0 },
    aiAccepted: { attempts: 0, credit: 0 },
    lastActivity: '2026-10-17T16:00:00.000Z',
  }));
  await page.addInitScript(
    ({ key, stats }) => {
      localStorage.setItem(key, JSON.stringify(stats));
    },
    { key: PREFIX + 'streamStats', stats },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('.progress-map li')).toHaveCount(16);
  for (const level of ['empty', 'low', 'medium', 'high'])
    await expect(
      page.locator(`.progress-map [data-level="${level}"]`).first(),
    ).toBeVisible();
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
  const link = page.locator('.progress-map a').nth(9);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Что решать')).toHaveValue('10');
});
