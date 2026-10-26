import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installInteractiveAudit } from '../fixtures/interactive-audit';

const url = 'http://127.0.0.1:4324/test-oge-app/dev/interactives/';

async function scene(page: Page) {
  await page.goto(url);
  const scene = page.locator('#bits-probe');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('[data-probe-ready]')).toBeVisible();
  return scene;
}

test('scene module is lazy; keyboard steps and pause preserve the answer', async ({
  page,
}) => {
  const requests = new Set<string | null>();
  page.on('request', (request) => {
    if (/InteractiveProbe\.tsx\?load=/u.test(request.url()))
      requests.add(new URL(request.url()).searchParams.get('load'));
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Подключить сцену', exact: true }),
  ).toBeEnabled();
  expect(requests.size).toBe(0);
  const scene = page.locator('#bits-probe');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('[data-probe-ready]')).toBeVisible();
  expect(requests.size).toBe(1);
  const add = scene.getByRole('button', { name: 'Добавить бит' });
  await add.focus();
  await add.press('Enter');
  await expect(add).toBeFocused();
  await expect(add).toHaveCSS('outline-style', 'solid');
  await expect(scene.locator('[data-probe-bits]')).toHaveText('1 бит');
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-interactive-active',
    'false',
  );
  await scene.scrollIntoViewIfNeeded();
  await expect(
    scene.getByRole('button', { name: 'Пауза', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(scene.locator('[data-probe-bits]')).toHaveText('1 бит');
});

test('automatic timers and frames pause offscreen and resume without losing state', async ({
  page,
}) => {
  await page.addInitScript(installInteractiveAudit);
  const view = await scene(page);
  await view.getByRole('button', { name: 'Автоматически' }).click();
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().intervals))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().frames))
    .toBe(1);
  await expect(view.locator('[data-probe-bits]')).not.toHaveText('0 бит');
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expect(view.locator('.interactive-host')).toHaveAttribute(
    'data-interactive-active',
    'false',
  );
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().intervals))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().frames))
    .toBe(0);
  const before = await view.locator('[data-probe-bits]').textContent();
  // An uncleared 250 ms interval would change the answer during this pause.
  await page.waitForTimeout(550);
  await expect(view.locator('[data-probe-bits]')).toHaveText(before ?? '');
  await view.scrollIntoViewIfNeeded();
  await expect(view.locator('.interactive-host')).toHaveAttribute(
    'data-interactive-active',
    'true',
  );
  await expect(view.locator('[data-probe-bits]')).not.toHaveText(before ?? '');
});

test('system and site motion settings update live; manual steps remain usable', async ({
  page,
}) => {
  await page.addInitScript(installInteractiveAudit);
  const view = await scene(page);
  await view.getByRole('button', { name: 'Автоматически' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(view.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().intervals))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().frames))
    .toBe(0);
  const before = Number(
    (await view.locator('[data-probe-bits]').textContent())?.split(' ')[0],
  );
  await view.getByRole('button', { name: 'Добавить бит' }).click();
  await expect(view.locator('[data-probe-bits]')).toHaveText(
    `${String(before + 1)} бит`,
  );
  const settings = await page.context().newPage();
  await settings.goto('http://127.0.0.1:4324/test-oge-app/settings/');
  await settings.getByLabel('Анимации', { exact: true }).uncheck();
  await page.bringToFront();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(view.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await view.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().intervals))
    .toBe(0);
  await settings.bringToFront();
  await settings.getByLabel('Анимации', { exact: true }).check();
  await page.bringToFront();
  await view.scrollIntoViewIfNeeded();
  await expect(view.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'false',
  );
  await expect
    .poll(() => page.evaluate(() => window.interactiveResources().intervals))
    .toBe(1);
});

test('a failed module can be retried while the explanation remains available', async ({
  page,
}) => {
  const attempts = new Set<string | null>();
  await page.route(/InteractiveProbe\.tsx\?load=/u, async (route) => {
    attempts.add(new URL(route.request().url()).searchParams.get('load'));
    if (attempts.size === 1) await route.abort();
    else await route.continue();
  });
  await page.goto(url);
  const view = page.locator('#bits-probe');
  await view.scrollIntoViewIfNeeded();
  await expect(view.getByRole('status').last()).toContainText(
    'Не удалось открыть',
  );
  await view.getByText('Текстовое объяснение', { exact: true }).click();
  await expect(view.locator('.interactive-alternative')).toContainText(
    'восемь бит',
  );
  await view.getByRole('button', { name: 'Загрузить ещё раз' }).click();
  await expect(view.locator('[data-probe-ready]')).toBeVisible();
  expect(attempts.size).toBe(2);
});

test('render errors are contained and retry uses corrected parameters', async ({
  page,
}) => {
  // Finish the lazy scene above the harness before scrolling to its checkbox.
  // Its loading layout must not move the checkbox during the native click.
  await scene(page);
  await page.getByLabel('Ошибка отрисовки').check();
  await page
    .getByRole('button', { name: 'Подключить сцену', exact: true })
    .click();
  const harness = page.locator('#harness-scene');
  await expect(harness.getByRole('status').last()).toContainText(
    'Не удалось открыть',
  );
  await page.getByLabel('Ошибка отрисовки').uncheck();
  await harness.getByRole('button', { name: 'Загрузить ещё раз' }).click();
  await expect(harness.locator('[data-probe-ready]')).toBeVisible();
  await harness.getByRole('button', { name: 'Добавить бит' }).click();
  await expect(harness.locator('[data-probe-bits]')).toHaveText('1 бит');
});

test('20 mount/unmount cycles leave no listeners, timers, frames or observers behind', async ({
  page,
}, info) => {
  const activate = (control: ReturnType<Page['getByRole']>) =>
    info.project.use.hasTouch ? control.tap() : control.click();
  await page.addInitScript(installInteractiveAudit);
  await scene(page);
  await page
    .getByRole('button', { name: 'Подключить сцену', exact: true })
    .scrollIntoViewIfNeeded();
  const baseline = await page.evaluate(() => window.interactiveResources());
  const moduleRequests: string[] = [];
  page.on('request', (request) => {
    if (/InteractiveProbe\.tsx\?load=/u.test(request.url()))
      moduleRequests.push(request.url());
  });
  const harness = page.locator('#harness-scene');
  for (let cycle = 0; cycle < 20; cycle += 1) {
    await activate(
      page.getByRole('button', { name: 'Подключить сцену', exact: true }),
    );
    await expect(harness.locator('[data-probe-ready]')).toBeVisible();
    await activate(harness.getByRole('button', { name: 'Автоматически' }));
    await expect
      .poll(() => page.evaluate(() => window.interactiveResources()))
      .toEqual({
        listeners: baseline.listeners + 3,
        intervals: baseline.intervals + 1,
        frames: baseline.frames + 1,
        intersections: baseline.intersections + 1,
        mutations: baseline.mutations + 1,
      });
    await activate(
      page.getByRole('button', { name: 'Отключить сцену', exact: true }),
    );
    await expect(harness.locator('[data-probe-ready]')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.interactiveResources()))
      .toEqual(baseline);
  }
  expect(moduleRequests).toEqual([]);
});

test('unmounting during module loading ignores the late result and can mount again', async ({
  page,
}) => {
  await page.addInitScript(installInteractiveAudit);
  const gate = Promise.withResolvers<undefined>();
  await page.route(/InteractiveProbe\.tsx\?load=/u, async (route) => {
    await gate.promise;
    await route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url);
    const requested = page.waitForRequest(/InteractiveProbe\.tsx\?load=/u);
    await page.locator('#bits-probe').scrollIntoViewIfNeeded();
    await requested;
    await page
      .getByRole('button', { name: 'Подключить сцену', exact: true })
      .click();
    const harness = page.locator('#harness-scene');
    await expect(harness).toContainText('Загрузка интерактива');
    await page
      .getByRole('button', { name: 'Отключить сцену', exact: true })
      .click();
    gate.resolve(undefined);
    await expect(page.locator('#bits-probe [data-probe-ready]')).toHaveCount(1);
    await expect(harness.locator('.interactive-host')).toHaveCount(0);
    const baseline = await page.evaluate(() => window.interactiveResources());
    await page
      .getByRole('button', { name: 'Подключить сцену', exact: true })
      .click();
    await expect(harness.locator('[data-probe-bits]')).toHaveText('0 бит');
    await page
      .getByRole('button', { name: 'Отключить сцену', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.interactiveResources()))
      .toEqual(baseline);
    expect(errors).toEqual([]);
  } finally {
    gate.resolve(undefined);
  }
});

test('no-JS and printed versions retain the full text alternative', async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noJs = await context.newPage();
    await noJs.goto(url);
    const view = noJs.locator('#bits-probe');
    await view.locator('summary').click();
    await expect(view.locator('.interactive-alternative > div')).toBeVisible();
    await expect(view.locator('.interactive-alternative')).toContainText(
      'целая часть — полные байты',
    );
    await expect(view.locator('noscript > p')).toBeVisible();
  } finally {
    await context.close();
  }
  const view = await scene(page);
  await expect(view.locator('.interactive-alternative > div')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(view.locator('.interactive-screen')).toBeHidden();
  await expect(view.locator('.interactive-alternative > div')).toBeVisible();
});

test('the scene is accessible in both themes at 360px with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const view = await scene(page);
  await view.locator('summary').click();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
