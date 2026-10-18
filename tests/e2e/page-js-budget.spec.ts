import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';

for (const path of ['about/', 'privacy/', 'missing-lesson/']) {
  test(`initial JavaScript stays within 60 KiB on ${path}`, async ({
    page,
  }) => {
    const scripts = new Map<string, number>();
    const pending: Promise<void>[] = [];
    page.on('response', (response) => {
      if (!new URL(response.url()).pathname.endsWith('.js')) return;
      pending.push(
        response.body().then((body) => {
          scripts.set(response.url(), gzipSync(body).length);
        }),
      );
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(path === 'missing-lesson/' ? 404 : 200);
    await page.waitForLoadState('networkidle');
    await Promise.all(pending);
    await expect(page.getByLabel('Тема', { exact: true })).toBeEnabled();
    const inline = await page
      .locator('script:not([src])')
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              element instanceof HTMLScriptElement &&
              (!element.type ||
                element.type === 'module' ||
                element.type === 'text/javascript'),
          )
          .map((element) => element.textContent)
          .join('\n'),
      );
    const bytes =
      [...scripts.values()].reduce((sum, value) => sum + value, 0) +
      (inline ? gzipSync(inline).length : 0);
    expect(scripts.size).toBeGreaterThan(0);
    expect(
      bytes,
      JSON.stringify(Object.fromEntries(scripts)),
    ).toBeLessThanOrEqual(60 * 1024);
  });
}

test('static page applies saved appearance before the body and follows settings from another tab', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'oge:informatics:v1:settings',
      JSON.stringify({
        version: 1,
        theme: 'dark',
        fontSize: 125,
        animations: false,
      }),
    );
    new MutationObserver((_, observer) => {
      if (!document.querySelector('body')) return;
      const root = document.documentElement;
      root.dataset.appearanceAtBody = [
        root.dataset.theme,
        root.dataset.fontSize,
        root.dataset.animations,
      ].join(':');
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('about/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-appearance-at-body',
    'dark:125:off',
  );
  const other = await context.newPage();
  try {
    await other.goto('settings/');
    await other.getByLabel('Тема оформления').selectOption('light');
    await expect(page.getByLabel('Тема', { exact: true })).toHaveValue('light');
    await other.getByLabel('Размер шрифта').selectOption('150');
    await expect(page.locator('html')).toHaveAttribute('data-font-size', '150');
    await page.getByLabel('Тема', { exact: true }).selectOption('dark');
    await expect(other.getByLabel('Тема оформления')).toHaveValue('dark');
    await expect(other.getByLabel('Размер шрифта')).toHaveValue('150');
  } finally {
    await other.close();
  }
});
