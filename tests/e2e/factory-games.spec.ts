import { expect, test as base, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { disableWebGL, installWebGLAudit } from '../fixtures/webgl-audit';
import { referenceProgram } from '../../src/core/generators/15/robots';
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
const games = [
  {
    id: 'robot-maze',
    route: 'materials/i13/robot-loops/',
    entry: 'Maze3D',
    harness: 'Лабиринт 3D',
    input: 'Программа Робота',
  },
  {
    id: 'sorting-center',
    route: 'materials/i12/sheet-selection/',
    entry: 'Sorting3D',
    harness: 'Сортировка 3D',
    input: 'Количество отобранных посылок',
  },
];
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Нет данных сценария.');
  return value;
}
async function open(page: Page, game: (typeof games)[number]) {
  await page.goto(game.route);
  const view = page.locator('#' + game.id);
  await view.scrollIntoViewIfNeeded();
  await expect(view.getByLabel('Уровень игры')).toBeVisible();
  return view;
}
test('Robot earns all levels with a general program, exact stepping and persistent progress', async ({
  page,
}) => {
  const view = await open(page, required(games[0]));
  await view.getByLabel('Программа Робота').fill('влево');
  await view
    .getByRole('button', { name: 'Шаг программы', exact: true })
    .click();
  await expect(view).toContainText('столкнулся со стеной');
  await view.getByRole('button', { name: 'Проверить на трёх полях' }).click();
  await expect(view).toContainText('Пройдено уровней: 0 из 3');
  for (const [i, family] of (
    ['robot-corridor', 'robot-wall-gaps', 'robot-stairs'] as const
  ).entries()) {
    await view.getByLabel('Уровень игры').selectOption(String(i));
    await view.getByLabel('Программа Робота').fill(referenceProgram(family));
    await view.getByLabel('Объёмная игра').check();
    await view
      .getByRole('button', { name: 'Выполнить до конца', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(view).toContainText('Все нужные клетки закрашены.');
    const check = view.getByRole('button', { name: 'Проверить на трёх полях' });
    await check.focus();
    await check.press('Enter');
    await expect(view).toContainText(`Пройдено уровней: ${String(i + 1)} из 3`);
  }
  await page.reload();
  await view.scrollIntoViewIfNeeded();
  await expect(view).toContainText('Пройдено уровней: 3 из 3');
});
test('sorting requires every correct decision, a counter and an aggregate on all three levels', async ({
  page,
}) => {
  const view = await open(page, required(games[1]));
  const cases = [
    {
      routes: [true, false, false, true, false, false, true, true],
      count: '4',
      sum: '25',
    },
    {
      routes: [true, false, false, false, true, false, true, false],
      count: '3',
      sum: '18',
    },
    {
      routes: [true, true, true, false, true, true, true, false],
      count: '6',
      sum: '23',
    },
  ];
  await view.getByLabel('Объёмная игра').check();
  for (const [i, example] of cases.entries()) {
    await view.getByLabel('Уровень игры').selectOption(String(i));
    await view
      .getByRole('button', { name: 'Проверить отбор и расчёт' })
      .click();
    await expect(view).toContainText('Распредели все восемь');
    for (const route of example.routes) {
      const button = view.getByRole('button', {
        name: route ? 'В отбор' : 'В остальные',
        exact: true,
      });
      await button.focus();
      await button.press('Enter');
    }
    await view.getByLabel('Количество отобранных посылок').fill('0');
    await view.getByLabel('Суммарная масса отбора, кг').fill('0');
    await view
      .getByRole('button', { name: 'Проверить отбор и расчёт' })
      .click();
    await expect(view).toContainText('Распределение верное. Пересчитай');
    await expect(view).toContainText(`Пройдено уровней: ${String(i)} из 3`);
    await view.getByLabel('Количество отобранных посылок').fill(example.count);
    await view.getByLabel('Суммарная масса отбора, кг').fill(example.sum);
    await view
      .getByRole('button', { name: 'Проверить отбор и расчёт' })
      .click();
    await expect(view).toContainText(`Пройдено уровней: ${String(i + 1)} из 3`);
  }
  await page.reload();
  await view.scrollIntoViewIfNeeded();
  await expect(view).toContainText('Пройдено уровней: 3 из 3');
});
test('automatic Robot execution pauses outside the view and manual changes reset it', async ({
  page,
}) => {
  const view = await open(page, required(games[0]));
  await view.getByLabel('Программа Робота').fill('нц 50 раз\nзакрасить\nкц');
  await view
    .getByRole('button', { name: 'Автовыполнение', exact: true })
    .click();
  await expect(view).not.toContainText('Шагов: 0.');
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  const position = view
    .getByRole('status')
    .filter({ hasText: /Робот: строка/u });
  await page.waitForTimeout(250);
  const outside = await position.textContent();
  await page.waitForTimeout(400);
  expect(await position.textContent()).toBe(outside);
  await view
    .getByRole('button', { name: 'Автовыполнение', exact: true })
    .scrollIntoViewIfNeeded();
  await view.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.waitForTimeout(250);
  const text = await view.getByRole('status').allTextContents();
  await page.waitForTimeout(400);
  expect(await view.getByRole('status').allTextContents()).toEqual(text);
  await view
    .getByRole('button', { name: 'Шаг программы', exact: true })
    .click();
  expect(await view.getByRole('status').allTextContents()).not.toEqual(text);
  await view.getByLabel('Программа Робота').fill('неизвестная команда');
  await view
    .getByRole('button', { name: 'Автовыполнение', exact: true })
    .click();
  await expect(
    view.getByRole('button', { name: 'Автовыполнение', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    view.getByRole('button', { name: 'Автовыполнение', exact: true }),
  ).toBeDisabled();
});
for (const game of games) {
  test(`${game.id}: heavy entry is lazy, context failure preserves state and retry works`, async ({
    page,
    browserName,
  }) => {
    const entries: string[] = [];
    page.on('request', (r) => {
      if (new RegExp(`${game.entry}\\.[\\w-]+\\.js`, 'u').test(r.url()))
        entries.push(r.url());
    });
    const view = await open(page, game);
    expect(entries).toHaveLength(0);
    await view
      .getByLabel(game.input)
      .fill(game.id === 'robot-maze' ? 'закрасить' : '123');
    await view.getByLabel('Объёмная игра').focus();
    await page.keyboard.press('Space');
    if (browserName === 'chromium') {
      const canvas = view.locator('canvas[data-three-ready="true"]');
      await expect(canvas).toBeVisible();
      expect(entries).toHaveLength(1);
      if (game.id === 'robot-maze')
        await view
          .getByRole('button', { name: 'Шаг программы', exact: true })
          .click();
      await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement))
          throw new Error('Нет canvas.');
        element
          .getContext('webgl2')
          ?.getExtension('WEBGL_lose_context')
          ?.loseContext();
      });
      await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
      await expect(view.locator('.three-node-label')).toHaveCount(0);
      await view
        .getByRole('button', { name: 'Открыть объёмную схему ещё раз' })
        .click();
      await expect(
        view.locator('canvas[data-three-ready="true"]'),
      ).toBeVisible();
    } else await expect(view.locator('[data-three-mode]')).toBeVisible();
    await expect(view.getByLabel(game.input)).toHaveValue(
      game.id === 'robot-maze' ? 'закрасить' : '123',
    );
    await view.getByLabel('Объёмная игра').uncheck();
  });
  test(`${game.id}: import failure preserves input and can retry`, async ({
    page,
    browserName,
  }) => {
    if (browserName !== 'chromium') await page.addInitScript(disableWebGL);
    let attempts = 0;
    await page.route(
      new RegExp(`${game.entry}\\.[\\w-]+\\.js`, 'u'),
      async (route) => {
        attempts++;
        if (attempts === 1) await route.abort();
        else await route.continue();
      },
    );
    const view = await open(page, game);
    await view
      .getByLabel(game.input)
      .fill(game.id === 'robot-maze' ? 'закрасить' : '3');
    await view.getByLabel('Объёмная игра').check();
    await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
    if (browserName === 'chromium') {
      await view
        .getByRole('button', { name: 'Повторить загрузку схемы' })
        .click();
      await expect(
        view.locator('canvas[data-three-ready="true"]'),
      ).toBeVisible();
      expect(attempts).toBe(2);
    }
    await expect(view.getByLabel(game.input)).toHaveValue(
      game.id === 'robot-maze' ? 'закрасить' : '3',
    );
  });
  test(`${game.id}: no WebGL retains the same game without loading three`, async ({
    page,
  }) => {
    await page.addInitScript(disableWebGL);
    const entries: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes(game.entry)) entries.push(r.url());
    });
    const view = await open(page, game);
    await view.getByLabel('Объёмная игра').check();
    await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
    await view.getByLabel('Уровень игры').selectOption('2');
    await expect(view.getByLabel('Уровень игры')).toHaveValue('2');
    expect(entries).toHaveLength(0);
  });
  test(`${game.id}: accessible in both themes and both views at 360px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const view = await open(page, game);
    for (const theme of ['light', 'dark'])
      for (const volume of [false, true]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await view.getByLabel('Объёмная игра').setChecked(volume);
        if (volume)
          await expect(view.locator('[data-three-mode]')).toBeVisible();
        expect(
          (await new AxeBuilder({ page }).include('#' + game.id).analyze())
            .violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
  });
  test(`${game.id}: 20 mounts free all native WebGL resources and labels`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(installWebGLAudit);
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
    // Finish the scene above the harness before it can shift the pointer target.
    await page.locator('#bits-probe').scrollIntoViewIfNeeded();
    await expect(page.locator('#bits-probe [data-probe-ready]')).toBeVisible();
    const harness = page.getByRole('region', {
      name: 'Повторное подключение и ошибки',
    });
    await harness.scrollIntoViewIfNeeded();
    await harness
      .getByLabel('Модуль для проверки')
      .selectOption({ label: game.harness });
    for (let i = 0; i < 20; i++) {
      await harness
        .getByRole('button', { name: 'Подключить сцену', exact: true })
        .click();
      if (browserName === 'chromium') {
        await expect(
          harness.locator('canvas[data-three-ready="true"]'),
        ).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.webGLResources().programs))
          .toBeGreaterThan(0);
      } else await expect(harness.locator('[data-three-mode]')).toBeVisible();
      await harness
        .getByRole('button', { name: 'Отключить сцену', exact: true })
        .click();
      await expect(harness.locator('.three-node-label')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.webGLResources().resources))
        .toBe(0);
      await expect
        .poll(() => page.evaluate(() => window.webGLResources().contexts))
        .toBe(0);
    }
    if (browserName === 'chromium')
      expect(
        (await page.evaluate(() => window.webGLResources())).losses,
      ).toBeGreaterThanOrEqual(20);
  });
}
