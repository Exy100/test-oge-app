import { expect, test } from '../fixtures/security-browser';
import type { Page } from '@playwright/test';
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
test('a renderer load failure is announced before editing or navigation is enabled', async ({
  page,
}) => {
  await page.route('**/_astro/render.*.js', (route) => route.abort());
  await page.goto('stream/');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось загрузить практику',
  );
  await expect(page.getByLabel('Что решать')).toBeDisabled();
  await expect(page.getByLabel('Твой ответ', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Как я решал')).toBeDisabled();
  await expect(page.locator('.stream-position')).toHaveText('Задание 1');
  await expect(page.locator('.task-card > .rich-text-container')).toBeVisible();
  expect((await stats(page)).completed).toBe(0);
  expect(await syntheticKey(page, { key: 'n' })).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('shortcuts: one transition per frame and twenty tasks with the network disconnected', async ({
  page,
  context,
}) => {
  await page.goto('stream/');
  await ready(page);
  await page.getByLabel('Как я решал').fill('До явного перехода');
  const requests: string[] = [];
  await page.route('**/_astro/*.js', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  const prevented = await page
    .locator('.stream-position')
    .evaluate((heading) => {
      heading.focus();
      return [
        { key: 'n' },
        { key: 'ArrowRight' },
        { key: 'n', repeat: true },
      ].map((init) => {
        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        });
        heading.dispatchEvent(event);
        return event.defaultPrevented;
      });
    });
  expect(prevented).toEqual([true, false, false]);
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 2');
  expect((await stats(page)).completed).toBe(1);
  await expect(page.getByLabel('Как я решал')).toHaveValue('');
  for (let position = 3; position <= 20; position += 1) {
    await page.keyboard.press(position % 2 ? 'n' : 'ArrowRight');
    await ready(page);
    await expect(page.locator('.stream-position')).toHaveText(
      `Задание ${String(position)}`,
    );
    await expect(page.locator('.stream-position')).toBeFocused();
    expect((await stats(page)).completed).toBe(position - 1);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('offline transitions preserve accepted results when storage is available only in memory', async ({
  page,
  context,
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
  await context.setOffline(true);
  await expect(page.getByLabel('Как я решал')).toHaveValue('Мой черновик');
  await page.keyboard.press('n');
  await ready(page);
  await expect(page.locator('.stream-position')).toHaveText('Задание 2');
  await expect(page.locator('.stream-controls > [role="alert"]')).toHaveCount(
    0,
  );
  await expect(page.locator('.progress-accuracy')).toHaveText('100%');
  await expect(page.locator('#storage-notice')).toBeVisible();
});
