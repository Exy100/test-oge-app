import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { buildFixedVariant } from '../../src/core/variants';
import { homeTask } from '../../src/lib/home-practice';
import { readyHome } from '../fixtures/home-browser';
import { PREFIX, areaSchemas } from '../../src/core/storage/schemas';
import { link, ready, current, stats } from '../fixtures/stream-browser';

const generator = generators.find((item) => item.id === 'numeral-sum-v2');
if (!generator) throw new Error('Missing numeral generator');
const task = generator.generate('ai-demo-ui');
if (task.answer.type !== 'integer') throw new Error('Expected integer answer');
const correct = task.answer.value;
const wrong = String(BigInt(correct) + 1n);

async function checked(page: Page, answer = correct) {
  await page.goto(link(task));
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
  expect(await stats(page)).toEqual(before);
  await expect(page.getByLabel('Как я решал', { exact: true })).toHaveValue(
    'Мой черновик',
  );
  expect(external).toEqual([]);
  expect(api).toEqual([]);
  expect(providers.length).toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page })
    .include('.ai-panel')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
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
