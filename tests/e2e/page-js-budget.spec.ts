import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';

for (const path of ['about/', 'privacy/', 'missing-lesson/']) {
  test(`initial JavaScript stays within 60 KB on ${path}`, async ({ page }) => {
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
    ).toBeLessThanOrEqual(60_000);
  });
}

test('text fonts use two local subset families with swap and a primary preload', async ({
  page,
}) => {
  await page.goto('about/');
  const fonts = await page.evaluate(() =>
    Array.from(document.fonts, (font) => ({
      family: font.family,
      display: font.display,
      unicodeRange: font.unicodeRange,
    })),
  );
  expect(fonts).toHaveLength(4);
  expect(new Set(fonts.map((font) => font.family)).size).toBe(2);
  for (const font of fonts) {
    expect(font.display).toBe('swap');
    expect(font.unicodeRange).not.toBe('U+0-10FFFF');
  }
  const preload = page.locator('link[rel="preload"][as="font"]');
  await expect(preload).toHaveCount(2);
  for (const subset of ['cyrillic', 'latin']) {
    const file = page.locator(
      `link[rel="preload"][as="font"][href*="golos-text-${subset}-"]`,
    );
    await expect(file).toHaveCount(1);
    const href = await file.getAttribute('href');
    expect(href).toMatch(/\.woff2$/u);
    expect(new URL(href ?? '', page.url()).origin).toBe(
      new URL(page.url()).origin,
    );
    expect((await page.request.get(href ?? '')).ok()).toBe(true);
  }
  await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(resources.filter((url) => url.includes('jetbrains-mono'))).toEqual([]);
  await expect(page.locator('.brand-icon svg')).toBeVisible();
});

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
