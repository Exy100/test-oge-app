import { expect, test as base, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installWebGLAudit, disableWebGL } from '../fixtures/webgl-audit';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const test = base.extend({
  launchOptions: async ({ browserName, launchOptions }, use) => {
    await use(
      browserName === 'chromium'
        ? {
            ...launchOptions,
            args: [
              ...(launchOptions.args ?? []),
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
            ],
          }
        : launchOptions,
    );
  },
});
const development = 'http://127.0.0.1:4324/test-oge-app/dev/interactives/';
async function open(page: Page) {
  await page.goto('materials/i1/bits-bytes/');
  const view = page.locator('#bits-and-bytes');
  await view.scrollIntoViewIfNeeded();
  await expect(view.getByLabel('Всего бит (0–1024)')).toBeVisible();
  return view;
}
test('3D entry is lazy and keyboard edits preserve the same byte calculation', async ({
  page,
  browserName,
}) => {
  const entries: string[] = [];
  page.on('request', (request) => {
    if (/BitCells3D\.[\w-]+\.js/u.test(request.url()))
      entries.push(request.url());
  });
  const view = await open(page);
  expect(entries).toHaveLength(0);
  await view.getByLabel('Всего бит (0–1024)').fill('19');
  const toggle = view.getByLabel('Объёмная схема', { exact: true });
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  if (browserName === 'chromium') {
    await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();
    expect(entries).toHaveLength(1);
    await expect(view.locator('canvas')).toHaveAttribute(
      'aria-label',
      'Восемь битовых ячеек. Остаток заполняет 3 из восьми.',
    );
  } else await expect(view.locator('[data-three-mode]')).toBeVisible();
  await expect(view).toContainText('Полных байтов: 2; осталось бит: 3');
  await view.getByLabel('Всего бит (0–1024)').focus();
  await page.keyboard.press('ArrowUp');
  await expect(view).toContainText('Полных байтов: 2; осталось бит: 4');
  await toggle.uncheck();
  await expect(view.locator('svg rect[fill="currentColor"]')).toHaveCount(4);
  await expect(view.locator('canvas')).toHaveCount(0);
  await expect(view.getByLabel('Всего бит (0–1024)')).toHaveValue('20');
});
test('no WebGL keeps the SVG, keyboard and exact calculation without loading three', async ({
  page,
}) => {
  await page.addInitScript(disableWebGL);
  const entries: string[] = [];
  page.on('request', (request) => {
    if (/BitCells3D\.[\w-]+\.js/u.test(request.url()))
      entries.push(request.url());
  });
  const view = await open(page);
  await view.getByLabel('Объёмная схема', { exact: true }).check();
  await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
  await expect(view.locator('svg rect[fill="currentColor"]')).toHaveCount(3);
  await view.getByLabel('Всего бит (0–1024)').fill('24');
  await expect(view).toContainText('Полных байтов: 3; осталось бит: 0');
  await expect(view.locator('svg rect[fill="currentColor"]')).toHaveCount(0);
  expect(entries).toHaveLength(0);
});
test('a failed 3D import falls back and retries with the unchanged input', async ({
  page,
  browserName,
}) => {
  if (browserName !== 'chromium') {
    await page.addInitScript(disableWebGL);
    const view = await open(page);
    await view.getByLabel('Объёмная схема', { exact: true }).check();
    await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
    return;
  }
  let attempts = 0;
  await page.route(/BitCells3D\.[\w-]+\.js/u, async (route) => {
    attempts++;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  const view = await open(page);
  await view.getByLabel('Всего бит (0–1024)').fill('23');
  await view.getByLabel('Объёмная схема', { exact: true }).check();
  await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
  await expect(view.locator('svg rect[fill="currentColor"]')).toHaveCount(7);
  await view.getByRole('button', { name: 'Повторить загрузку схемы' }).click();
  await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();
  await expect(view.getByLabel('Всего бит (0–1024)')).toHaveValue('23');
  expect(attempts).toBe(2);
});
test.describe('high pixel density', () => {
  test.use({ deviceScaleFactor: 3 });
  test('the drawing buffer never exceeds twice the CSS canvas size', async ({
    page,
    browserName,
  }) => {
    const view = await open(page);
    await view.getByLabel('Объёмная схема', { exact: true }).check();
    if (browserName !== 'chromium') {
      await expect(view.locator('[data-three-mode]')).toBeVisible();
      return;
    }
    const canvas = view.locator('canvas[data-three-ready="true"]');
    await expect(canvas).toBeVisible();
    const size = await canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement))
        throw new Error('Не найден canvas.');
      const rect = element.getBoundingClientRect();
      return {
        width: element.width,
        height: element.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr: window.devicePixelRatio,
      };
    });
    expect(size.dpr).toBe(3);
    expect(size.width).toBeGreaterThan(0);
    expect(size.width).toBeLessThanOrEqual(Math.ceil(size.cssWidth * 2));
    expect(size.height).toBeLessThanOrEqual(Math.ceil(size.cssHeight * 2));
  });
});
test('context loss falls back without changing the input or full-byte result', async ({
  page,
  browserName,
}) => {
  await page.addInitScript(installWebGLAudit);
  const view = await open(page);
  await view.getByLabel('Всего бит (0–1024)').fill('29');
  await view.getByLabel('Объёмная схема', { exact: true }).check();
  if (browserName !== 'chromium') {
    await expect(view.locator('[data-three-mode]')).toBeVisible();
    await expect(view).toContainText('Полных байтов: 3; осталось бит: 5');
    return;
  }
  const canvas = view.locator('canvas[data-three-ready="true"]');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.webGLResources().programs))
    .toBeGreaterThan(0);
  await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement))
      throw new Error('Не найден canvas.');
    const gl = element.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 не создан.');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (!lose) throw new Error('Нет расширения потери контекста.');
    lose.loseContext();
  });
  await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
  await expect(view.locator('svg rect[fill="currentColor"]')).toHaveCount(5);
  await expect(view.getByLabel('Всего бит (0–1024)')).toHaveValue('29');
  await view.getByLabel('Всего бит (0–1024)').fill('32');
  await expect(view).toContainText('Полных байтов: 4; осталось бит: 0');
  await expect
    .poll(() => page.evaluate(() => window.webGLResources().resources))
    .toBe(0);
  await view
    .getByRole('button', { name: 'Открыть объёмную схему ещё раз' })
    .click();
  await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();
  await expect(view.locator('canvas')).toHaveAttribute(
    'aria-label',
    'Восемь битовых ячеек. Остаток заполняет 0 из восьми.',
  );
});
test('pause and reduced motion stop native drawing while manual changes still render', async ({
  page,
  browserName,
}) => {
  await page.addInitScript(installWebGLAudit);
  const view = await open(page);
  await view.getByLabel('Объёмная схема', { exact: true }).check();
  if (browserName !== 'chromium') {
    await expect(view.locator('[data-three-mode]')).toBeVisible();
    await view.getByRole('button', { name: 'Пауза', exact: true }).click();
    await view.getByLabel('Всего бит (0–1024)').fill('9');
    await expect(view).toContainText('Полных байтов: 1; осталось бит: 1');
    return;
  }
  await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.webGLResources().draws))
    .toBeGreaterThan(16);
  await view.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(view.locator('.three-stage')).toHaveAttribute(
    'data-three-running',
    'false',
  );
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => window.webGLResources().draws);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.webGLResources().draws)).toBe(paused);
  await view.getByLabel('Всего бит (0–1024)').fill('9');
  await expect
    .poll(() => page.evaluate(() => window.webGLResources().draws))
    .toBeGreaterThan(paused);
  await expect(view).toContainText('Полных байтов: 1; осталось бит: 1');
  await view.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(view.locator('.three-stage')).toHaveAttribute(
    'data-three-running',
    'false',
  );
  await page.waitForTimeout(100);
  const still = await page.evaluate(() => window.webGLResources().draws);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.webGLResources().draws)).toBe(still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await view.locator('canvas').scrollIntoViewIfNeeded();
  await expect(view.locator('.three-stage')).toHaveAttribute(
    'data-three-running',
    'true',
  );
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expect(view.locator('.three-stage')).toHaveAttribute(
    'data-three-running',
    'false',
  );
  await page.waitForTimeout(100);
  const outside = await page.evaluate(() => window.webGLResources().draws);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.webGLResources().draws)).toBe(
    outside,
  );
  await view.locator('canvas').scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.webGLResources().draws))
    .toBeGreaterThan(outside);
});
test('twenty native WebGL mount/unmount cycles release every handle and context', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(installWebGLAudit);
  await page.goto(development);
  await page.locator('#bits-probe').scrollIntoViewIfNeeded();
  await expect(page.locator('#bits-probe [data-probe-ready]')).toBeVisible();
  const harness = page.getByRole('region', {
    name: 'Повторное подключение и ошибки',
  });
  await harness.scrollIntoViewIfNeeded();
  await harness
    .getByLabel('Модуль для проверки')
    .selectOption({ label: 'Объёмные битовые ячейки' });
  for (let cycle = 0; cycle < 20; cycle++) {
    await harness
      .getByRole('button', { name: 'Подключить сцену', exact: true })
      .click();
    if (browserName === 'chromium') {
      await expect(
        harness.locator('canvas[data-three-ready="true"]'),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.webGLResources().buffers))
        .toBeGreaterThan(0);
      await expect
        .poll(() => page.evaluate(() => window.webGLResources().programs))
        .toBeGreaterThan(0);
      if (cycle === 0)
        await expect(harness.locator('[data-three-meter]')).toContainText(
          /\d+ кадров\/с; геометрий: [1-9]/u,
        );
    } else await expect(harness.locator('[data-three-mode]')).toBeVisible();
    await harness
      .getByRole('button', { name: 'Отключить сцену', exact: true })
      .click();
    await expect(harness.locator('canvas')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.webGLResources().resources))
      .toBe(0);
    await expect
      .poll(() => page.evaluate(() => window.webGLResources().contexts))
      .toBe(0);
  }
  if (browserName === 'chromium') {
    const measured = await page.evaluate(() => window.webGLResources());
    expect(measured.allocations).toBeGreaterThan(200);
    expect(measured.losses).toBeGreaterThanOrEqual(20);
  }
});
test('3D and fallback are accessible in both themes at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const view = await open(page);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    for (const volume of [false, true]) {
      await view
        .getByLabel('Объёмная схема', { exact: true })
        .setChecked(volume);
      if (volume) await expect(view.locator('[data-three-mode]')).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).include('#bits-and-bytes').analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
});
test('the complete 3D JavaScript graph stays within 250 KB gzip and hides dev meters', async () => {
  const files = await readdir('dist/_astro');
  const entry = files.find((file) => /^BitCells3D\.[\w-]+\.js$/u.test(file));
  if (!entry) throw new Error('Нет production-модуля объёмной схемы.');
  const seen = new Set<string>();
  async function bytes(file: string): Promise<number> {
    if (seen.has(file)) return 0;
    seen.add(file);
    const source = await readFile(join('dist/_astro', file), 'utf8');
    expect(source).not.toContain('кадров/с');
    let size = gzipSync(source).length;
    for (const [, dependency] of source.matchAll(
      /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/gu,
    ))
      if (dependency) size += await bytes(dependency.slice(2));
    return size;
  }
  const size = await bytes(entry);
  console.info('T8.1 3D graph gzip bytes: ' + String(size));
  expect(size).toBeLessThanOrEqual(250_000);
});
