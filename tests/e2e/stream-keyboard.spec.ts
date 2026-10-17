import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import { resolveStreamTask } from '../../src/core/stream/catalog';
import { initialStreamState } from '../../src/lib/stream-start';
import { first, link, ready, stats, answer } from '../fixtures/stream-browser';

async function syntheticKey(
  page: Page,
  init: Pick<
    KeyboardEventInit,
    | 'key'
    | 'code'
    | 'repeat'
    | 'isComposing'
    | 'ctrlKey'
    | 'altKey'
    | 'metaKey'
    | 'shiftKey'
  >,
  prevent = false,
) {
  return page.locator('.stream-position').evaluate(
    (target, { init, prevent }) => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      if (prevent) event.preventDefault();
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { init, prevent },
  );
}

test('shortcuts: N, Russian Т, right arrow, native Enter and an accessible off switch', async ({
  page,
}) => {
  await page.goto(link(first));
  await ready(page);
  const toggle = page.getByRole('checkbox', {
    name: 'Горячие клавиши N и →',
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await page.locator('.stream-position').focus();
  await page.keyboard.press('n');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 2');
  await page.keyboard.press('ArrowRight');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 3');
  expect(await syntheticKey(page, { key: 'т', code: 'KeyN' })).toBe(true);
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 4');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  expect(await syntheticKey(page, { key: 'n' })).toBe(false);
  expect(await syntheticKey(page, { key: 'ArrowRight' })).toBe(false);
  await expect(
    page.getByRole('button', { name: 'Пропустить задание', exact: true }),
  ).not.toHaveAttribute('aria-keyshortcuts');
  await toggle.check();
  const next = page.getByRole('button', {
    name: 'Пропустить задание',
    exact: true,
  });
  await next.focus();
  await page.keyboard.press('Enter');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 5');
  await next.focus();
  await page.keyboard.press('n');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 6');
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
test('shortcuts: modifiers, repeats, composition, cancelled events and Enter do not advance', async ({
  page,
}) => {
  await page.goto(link(first));
  await ready(page);
  const original = page.url();
  for (const init of [
    { key: 'n', repeat: true },
    { key: 'n', isComposing: true },
    { key: 'n', ctrlKey: true },
    { key: 'n', altKey: true },
    { key: 'n', metaKey: true },
    { key: 'ArrowRight', shiftKey: true },
    { key: 'Enter' },
    { key: 'ArrowLeft' },
    { key: 'x' },
  ])
    expect(await syntheticKey(page, init)).toBe(false);
  expect(await syntheticKey(page, { key: 'n' }, true)).toBe(true);
  await expect(page).toHaveURL(original);
  expect((await stats(page)).completed).toBe(0);
});
test('shortcuts: answer, notes, filters, links and help buttons keep native keyboard behavior', async ({
  page,
}) => {
  await page.goto(link(first));
  await ready(page);
  const original = page.url();
  const input = page.getByLabel('Твой ответ', { exact: true });
  await input.fill('123');
  await input.press('ArrowRight');
  await input.press('n');
  await expect(input).toHaveValue('123n');
  const notes = page.getByLabel('Как я решал');
  await notes.fill('Черновик');
  await notes.press('Enter');
  await notes.press('n');
  await expect(notes).toHaveValue('Черновик\nn');
  await page.getByText('Фильтры заданий', { exact: true }).click();
  for (const control of [
    page.getByLabel('Что решать'),
    page.getByLabel('Тема задания', { exact: true }),
    page.getByRole('checkbox', { name: '№10', exact: true }),
    page.locator('.stream-filters summary'),
    page.locator('.progress-map a').first(),
    page.getByRole('button', { name: 'Открыть подсказку 1 из 3', exact: true }),
  ]) {
    expect(
      await control.evaluate((target) => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(false);
  }
  await expect(page).toHaveURL(original);
  expect((await stats(page)).completed).toBe(0);
});
for (const number of [15, 16]) {
  test(`shortcuts: №${String(number)} editor, criteria and scrolling preserve the task`, async ({
    page,
  }) => {
    const task = generators
      .find((item) => item.taskNumber === number)
      ?.generate('keyboard-editor');
    if (!task) throw new Error('Нет практического задания.');
    await page.goto(link(task));
    await ready(page);
    const original = page.url();
    const editor = page.getByLabel(
      number === 15 ? 'Программа Робота' : 'Код Python',
      { exact: true },
    );
    await editor.fill('n');
    await editor.press('Enter');
    await editor.press('n');
    await editor.press('ArrowRight');
    await expect(editor).toHaveValue('n\nn');
    const firstRadio = page.getByRole('radio').first();
    await firstRadio.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
    if (number === 16) {
      const pre = page.getByRole('region', {
        name: 'Команда запуска Python',
        exact: true,
      });
      await pre.focus();
      await page.keyboard.press('ArrowRight');
    }
    await expect(page).toHaveURL(original);
    expect((await stats(page)).completed).toBe(0);
    await expect(editor).toHaveValue('n\nn');
  });
}
test('shortcuts: one transition while a task loads, held keys and explicit reload recovery', async ({
  page,
}) => {
  await page.goto('stream/');
  await ready(page);
  await page.getByLabel('Как я решал').fill('Сохранить при отказе');
  const requested = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  await page.route('**/_astro/*.js', async (route) => {
    requested.resolve(undefined);
    await release.promise;
    await route.abort();
  });
  await page.locator('.stream-position').focus();
  await page.keyboard.press('n');
  await requested.promise;
  await expect(page.locator('.stream-controls')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(await syntheticKey(page, { key: 'n' })).toBe(false);
  expect(await syntheticKey(page, { key: 'ArrowRight', repeat: true })).toBe(
    false,
  );
  release.resolve(undefined);
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось подготовить задание',
  );
  await expect(page.getByLabel('Как я решал')).toHaveValue(
    'Сохранить при отказе',
  );
  expect((await stats(page)).completed).toBe(0);
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('alert')).toContainText('скопируй черновик');
  const reloadErrors: string[] = [];
  page.on('pageerror', (error) => {
    reloadErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    reloadErrors.push(
      `${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`,
    );
  });
  page.on('console', (message) => {
    if (message.type() === 'error') reloadErrors.push(message.text());
  });
  try {
    await Promise.all([
      page.waitForEvent('load'),
      page
        .getByRole('button', { name: 'Перезагрузить страницу', exact: true })
        .click(),
    ]);
    await ready(page);
  } catch (cause) {
    throw new Error(
      `Практика не восстановилась после загрузки страницы: ${JSON.stringify(reloadErrors)}`,
      { cause },
    );
  }
  await page.locator('.stream-position').focus();
  await page.keyboard.press('n');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 2');
  expect((await stats(page)).completed).toBe(1);
});

test('reload recovery warns when accepted results exist only in memory', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.goto('stream/');
  await ready(page);
  const task = resolveStreamTask(initialStreamState().current.reference);
  await page.getByLabel('Как я решал').fill('Мой черновик');
  await page.getByLabel('Твой ответ', { exact: true }).fill(answer(task, true));
  await page.getByLabel('Твой ответ', { exact: true }).press('Enter');
  await expect(page.locator('.task-feedback')).toBeFocused();
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  await expect(page.locator('#storage-notice')).toBeVisible();
  await page.route('**/_astro/*.js', (route) => route.abort());
  await page.keyboard.press('n');
  const navigationError = page.locator('.stream-controls > [role="alert"]');
  await expect(navigationError).toContainText('Хранилище недоступно');
  await expect(navigationError).toContainText('возможна потеря результатов');
  await expect(page.getByLabel('Как я решал')).toHaveValue('Мой черновик');
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
});
