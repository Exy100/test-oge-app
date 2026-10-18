import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { homeTask } from '../../src/lib/home-practice';
import { readyHome } from '../fixtures/home-browser';
import { answer } from '../fixtures/stream-answers';
import { stats } from '../fixtures/stream-browser';

test('страница, локальные ресурсы и доступность', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${String(response.status())} ${response.url()}`);
  });
  expect((await page.goto('./'))?.status()).toBe(200);
  await expect(page).toHaveTitle('ОГЭ по информатике — практика и теория');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'ОГЭ по информатике.',
  );
  await readyHome(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(resources.some((url) => url.includes('/test-oge-app/_astro/'))).toBe(
    true,
  );
  expect(
    resources.every((url) =>
      url.startsWith('https://127.0.0.1:4322/test-oge-app/'),
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('общая проверка ответа, однократный зачёт и сохранённый прогресс', async ({
  page,
}) => {
  await page.goto('./');
  await readyHome(page);
  const input = page.getByLabel('Твой ответ', { exact: true });
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect((await stats(page)).completed).toBe(0);
  await input.fill(answer(homeTask('volume', 0), true));
  await input.press('Enter');
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  await expect(page.getByTestId('solved-count')).toHaveText('1');
  await input.press('Enter');
  expect((await stats(page)).completed).toBe(1);
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(page.locator('.home-task-heading')).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill(answer(homeTask('volume', 1), false));
  await input.press('Enter');
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'incorrect',
  );
  expect((await stats(page)).completed).toBe(2);
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await input.fill(answer(homeTask('volume', 2), true));
  await input.press('Enter');
  await expect(page.getByTestId('solved-count')).toHaveText('2');
  expect(
    (await stats(page)).entries.find((row) => row.taskNumber === 1)?.correct,
  ).toBe(2);
  await page.reload();
  await readyHome(page);
  await expect(page.getByTestId('solved-count')).toHaveText('0');
  expect((await stats(page)).completed).toBe(3);
});

test('темы, общие подсказки, решение и сброс карточки', async ({ page }) => {
  await page.goto('./');
  await readyHome(page);
  await page.getByRole('radio', { name: 'Объём текста' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Логика' })).toBeChecked();
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill(answer(homeTask('logic', 0), true));
  await page.getByLabel('Твой ответ', { exact: true }).press('Enter');
  await expect(page.locator('.task-feedback')).toHaveAttribute(
    'data-verdict',
    'correct',
  );
  for (let index = 0; index < 3; index += 1) {
    await page
      .getByRole('button', {
        name: `Открыть подсказку ${String(index + 1)} из 3`,
        exact: true,
      })
      .click();
    await expect(page.locator('.task-guidance [id$="-hints"] li')).toHaveCount(
      index + 1,
    );
  }
  const task = homeTask('logic', 0);
  for (let index = 0; index < task.solution.length; index += 1) {
    await page
      .getByRole('button', {
        name: index ? 'Следующий шаг решения' : 'Показать решение по шагам',
        exact: true,
      })
      .click();
    await expect(
      page.locator('.task-guidance [id$="-solution"] li'),
    ).toHaveCount(index + 1);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('radio', { name: 'Системы счисления' }).check();
  await expect(page.locator('.task-guidance [id$="-hints"] li')).toHaveCount(0);
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue('');
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill(answer(homeTask('binary', 0), true));
  await page.getByLabel('Твой ответ', { exact: true }).press('Enter');
  await expect(page.getByTestId('solved-count')).toHaveText('2');
  await page.getByRole('radio', { name: 'Логика' }).check();
  await expect(page.locator('.exercise-position')).toHaveText('Задание 2');
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue('');
});

test('ссылка открывает то же условие и выбранный номер в потоке', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await readyHome(page);
  await page.getByRole('radio', { name: 'Системы счисления' }).check();
  const html = await page
    .locator('.task-card > .rich-text-container > .rich-text')
    .innerHTML();
  const url = await page
    .getByRole('link', { name: 'Продолжить это задание в практике' })
    .getAttribute('href');
  if (!url) throw new Error('Нет ссылки на практику.');
  const replay = await context.newPage();
  try {
    await replay.goto(new URL(url, page.url()).href);
    await expect(replay.getByLabel('Что решать')).toHaveValue('10');
    await expect(
      replay.locator('.task-card > .rich-text-container > .rich-text'),
    ).toHaveJSProperty('innerHTML', html);
    await replay
      .getByLabel('Твой ответ', { exact: true })
      .fill(answer(homeTask('binary', 0), true));
    await replay.getByLabel('Твой ответ', { exact: true }).press('Enter');
    await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  } finally {
    await replay.close();
  }
});

for (const failure of ['blocked', 'quota']) {
  test(`главная сохраняет результат в памяти при ${failure}`, async ({
    page,
  }) => {
    await page.addInitScript((kind) => {
      if (kind === 'blocked')
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Blocked', 'SecurityError');
          },
        });
      else
        Storage.prototype.setItem = () => {
          throw new DOMException('Full', 'QuotaExceededError');
        };
    }, failure);
    await page.goto('./');
    await readyHome(page);
    await page
      .getByLabel('Твой ответ', { exact: true })
      .fill(answer(homeTask('volume', 0), true));
    await page.getByLabel('Твой ответ', { exact: true }).press('Enter');
    await expect(page.getByTestId('solved-count')).toHaveText('1');
    await expect(page.locator('.progress-accuracy')).toHaveText('100%');
    await expect(page.locator('#storage-notice')).toContainText('памяти');
  });
}

test('теория и решения читаются без JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
  });
  try {
    if (!baseURL) throw new Error('Не задан адрес сайта.');
    const page = await context.newPage();
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'ОГЭ по информатике.',
    );
    await expect(page.locator('.no-script')).toContainText(
      'Для автоматической проверки включи JavaScript.',
    );
    await expect(
      page.getByRole('button', { name: 'Проверить ответ', exact: true }),
    ).toBeDisabled();
    const topics = ['volume', 'logic', 'binary'] as const;
    const cards = page.locator('.material-card');
    await expect(cards).toHaveCount(3);
    for (const [index, topic] of topics.entries()) {
      const card = cards.nth(index);
      await card.locator(':scope > details > summary').click();
      await expect(card.locator('.material-example')).toBeVisible();
      await expect(card.locator('.material-example > ol > li')).toHaveCount(
        homeTask(topic, 0).solution.length,
      );
    }
  } finally {
    await context.close();
  }
});
