import { expect, test } from '../fixtures/security-browser';
import AxeBuilder from '@axe-core/playwright';
import {
  auditPages,
  builtPages,
  locations,
  sitemapUrls,
} from '../fixtures/site-pages';
import { SITE_BASE } from '../../src/lib/site';

test('sitemap is served, is unique and covers the complete built HTML inventory', async ({
  request,
}) => {
  const response = await request.get('sitemap.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');
  expect(sitemapUrls(await response.text())).toEqual(locations);
  expect(new Set(locations).size).toBe(locations.length);
  expect(builtPages.length).toBeGreaterThan(0);
  expect(auditPages.map((row) => row.path).sort()).toEqual(
    builtPages.map((row) => row.path).sort(),
  );
  console.info(
    `T9.1: ${String(locations.length)} sitemap URLs; ${String(builtPages.length)} built HTML pages audited including noindex/404.`,
  );
});

for (const route of auditPages)
  for (const theme of ['light', 'dark']) {
    test(`${route.path || '/'}: ${theme}, complete page axe, keyboard and 200% text`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      expect((await page.goto(route.requestPath))?.status()).toBe(route.status);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const noindex = await page.evaluate(
        () =>
          document
            .querySelector('meta[name="robots" i]')
            ?.getAttribute('content') ?? '',
      );
      expect(
        route.inSitemap,
        'Every indexable HTML page must be in the sitemap',
      ).toBe(route.status === 200 && !/\bnoindex\b/iu.test(noindex));
      await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute(
        'href',
        SITE_BASE + 'sitemap.xml',
      );

      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', {
        name: 'К основному содержимому',
        exact: true,
      });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      expect(
        await skip.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
          );
        }),
      ).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();

      const chooser = page.getByLabel('Тема', { exact: true });
      await expect(chooser).toBeEnabled();
      await chooser.selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const scene of await page.locator('.lesson-interactive').all()) {
        await scene.locator('astro-island').first().scrollIntoViewIfNeeded();
        await expect(scene.locator('.interactive-host')).toBeVisible();
        await expect(
          scene.getByText('Загрузка интерактива…', { exact: true }),
        ).toHaveCount(0);
        await expect(scene.locator('.interactive-error')).toHaveCount(0);
        await expect(
          scene
            .locator('.interactive-host > .interactive-toolbar')
            .getByRole('button', { name: 'Пауза', exact: true }),
        ).toBeEnabled();
      }
      await expect(
        page.locator('astro-island[client="load"][ssr]'),
      ).toHaveCount(0);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      // Expose the explanatory material as well as the initially visible page.
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach((element) => {
          element.open = true;
        });
        document.documentElement.style.fontSize = '200%';
      });
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        offenders:
          document.documentElement.scrollWidth > innerWidth
            ? Array.from(document.querySelectorAll('main *'))
                .filter(
                  (element) =>
                    element.getBoundingClientRect().right > innerWidth,
                )
                .slice(0, 15)
                .map((element) => ({
                  tag: element.tagName,
                  class: element.getAttribute('class'),
                  width: element.getBoundingClientRect().width,
                  right: element.getBoundingClientRect().right,
                  minWidth: getComputedStyle(element).minWidth,
                  overflow: getComputedStyle(element).overflowX,
                }))
            : [],
      }));
      expect(
        layout.document,
        'No page-level horizontal overflow at 200% text: ' +
          JSON.stringify(layout),
      ).toBeLessThanOrEqual(layout.viewport);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
