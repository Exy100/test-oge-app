import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { xssContent } from '../fixtures/xss-content';

const devUrl = 'http://127.0.0.1:4324/test-oge-app/dev/rich-text/';
test('server math is present without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('https://127.0.0.1:4322/test-oge-app/');
    await expect(
      page.locator('#materials .material-card > .rich-text-container math'),
    ).toBeVisible();
    for (const summary of await page
      .locator('#materials .material-card > details > summary')
      .all())
      await summary.click();
    for (const formula of await page.locator('#materials math').all())
      await expect(formula).toBeVisible();
    await expect(page.locator('#materials .math-error')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test('client rendering supports tables and MathML and remains accessible in both themes', async ({
  page,
}) => {
  await page.goto(devUrl);
  await expect(
    page
      .locator('#client-rich-text')
      .getByRole('button', { name: 'Скопировать код' }),
  ).toBeEnabled();
  await expect(page.locator('.rich-text math')).toBeVisible();
  await expect(page.locator('.rich-text table')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
test('malicious source cannot execute scripts, navigate or load an image', async ({
  page,
}) => {
  await page.goto(devUrl);
  await expect(
    page
      .locator('#client-rich-text')
      .getByRole('button', { name: 'Скопировать код' }),
  ).toBeEnabled();
  for (const source of xssContent) {
    const before = await page
      .locator('#client-rich-text .rich-text')
      .innerHTML();
    await page.getByLabel('Содержимое').fill(source);
    await expect
      .poll(() => page.locator('#client-rich-text .rich-text').innerHTML())
      .not.toBe(before);
    await expect(
      page.locator(
        '.rich-text script, .rich-text img, .rich-text iframe, .rich-text svg, .rich-text a, .rich-text input',
      ),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const value: unknown = Reflect.get(globalThis, 'richAttack');
        return value === undefined;
      }),
    ).toBe(true);
    expect(page.url()).toBe(devUrl);
  }
});
test('copy transfers code as text and reports clipboard failure', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          document.documentElement.dataset.copied = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(devUrl);
  await expect(
    page
      .locator('#client-rich-text')
      .getByRole('button', { name: 'Скопировать код' }),
  ).toBeEnabled();
  const code = 'print(8 * 8)\n';
  await page
    .locator('#server-rich-text')
    .getByRole('button', { name: 'Скопировать код' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-copied', code);
  await expect(
    page.locator('#server-rich-text').getByRole('status'),
  ).toHaveText('Код скопирован.');
  await page
    .locator('#client-rich-text')
    .getByRole('button', { name: 'Скопировать код' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-copied', code);
  await expect(
    page.locator('#client-rich-text').getByRole('status'),
  ).toHaveText('Код скопирован.');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard denied')) },
    });
  });
  await page
    .locator('#client-rich-text')
    .getByRole('button', { name: 'Скопировать код' })
    .click();
  await expect(
    page.locator('#client-rich-text').getByRole('status'),
  ).toContainText('Выдели код');
});

test('executor command numbers remain visible in lessons, practice and print', async ({
  page,
}) => {
  for (const lesson of [
    'executor-commands',
    'executor-algorithm',
    'executor-reverse',
    'executor-check',
  ]) {
    await page.goto(`materials/i5/${lesson}/`);
    const lists = page.locator(
      '.lesson-example > .rich-text-container > .rich-text > ol',
    );
    await expect(lists).toHaveCount(3);
    for (const list of await lists.all()) {
      await expect(list).toHaveCSS('list-style-type', 'decimal');
      await expect(list.locator(':scope > li')).toHaveCount(2);
      await expect(list.locator(':scope > li').first()).toHaveCSS(
        'display',
        'list-item',
      );
    }
    await page.emulateMedia({ media: 'print' });
    for (const list of await lists.all())
      await expect(list).toHaveCSS('list-style-type', 'decimal');
    await page.emulateMedia({ media: 'screen' });
  }
  await page.goto(
    'stream/?task=executor-square-v2&seed=executor-numbering&numbers=5',
  );
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  const commands = page.locator('.task-card .rich-text > ol').first();
  await expect(commands).toHaveCSS('list-style-type', 'decimal');
  await expect(commands.locator(':scope > li')).toHaveCount(2);
});
