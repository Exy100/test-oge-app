import {
  expect,
  test as base,
  type Page,
  type Locator,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { disableWebGL, installWebGLAudit } from '../fixtures/webgl-audit';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error('Отсутствуют данные проверочного сценария.');
  return value;
}

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
    id: 'bit-warehouse',
    page: 'materials/i1/bits-bytes/',
    entry: 'Warehouse3D',
    label: 'Склад битов 3D',
    input: 'Всего бит в выбранном грузе',
  },
  {
    id: 'packet-route',
    page: 'materials/i7/restore-address/',
    entry: 'Packet3D',
    label: 'Сеть 3D',
    input: 'Метки фрагментов URL',
  },
];
async function open(page: Page, game: (typeof games)[number]) {
  await page.goto(game.page);
  const view = page.locator(`#${game.id}`);
  await view.scrollIntoViewIfNeeded();
  await expect(view.getByLabel('Уровень игры')).toBeVisible();
  return view;
}
async function choose(field: Locator, value: number) {
  await field.focus();
  await field.press('Home');
  for (let i = 0; i < value; i++) await field.press('ArrowDown');
  await field.press('Tab');
  await expect(field).toHaveValue(String(value));
}
async function savedLevels(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('oge:informatics:v1:lessonProgress') ??
          '{"entries":[]}',
      ) as { entries: { levels: string[] }[] },
  );
}

test('all warehouse levels use keyboard controls, require a calculation and persist only earned progress', async ({
  page,
}) => {
  await page.addInitScript(disableWebGL);
  const view = await open(page, required(games[0]));
  await view.getByLabel('Объёмная игра').check();
  await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
  for (let level = 0; level < 3; level++) {
    await choose(view.getByLabel('Уровень игры'), level);
    const counts = level === 2 ? [4, 1, 1] : [2, 1, 1];
    for (let i = 0; i < 3; i++)
      await choose(
        view.locator(`select[id$="-cargo-${String(i)}"]`),
        required(counts[i]),
      );
    await view.getByLabel('Всего бит в выбранном грузе').fill('1');
    const check = view.getByRole('button', {
      name: 'Проверить упаковку и расчёт',
    });
    await check.focus();
    await check.press('Enter');
    await expect(view).toContainText('Проверь расчёт');
    expect(
      (await savedLevels(page)).entries.flatMap((row) => row.levels),
    ).toHaveLength(level);
    await view
      .getByLabel('Всего бит в выбранном грузе')
      .fill(level === 2 ? '800' : '352');
    await view
      .getByLabel('Всего байт в выбранном грузе')
      .fill(level === 2 ? '100' : '44');
    await check.focus();
    await check.press('Enter');
    await expect(view).toContainText(
      `Пройдено уровней: ${String(level + 1)} из 3`,
    );
    await expect(view).toContainText('Верно:');
  }
  await page.reload();
  await view.scrollIntoViewIfNeeded();
  await expect(view).toContainText('Пройдено уровней: 3 из 3');
  expect(
    (await savedLevels(page)).entries.flatMap((row) => row.levels),
  ).toHaveLength(3);
});

test('all packet levels require the exact address, a legal route and all paths; progress survives reload', async ({
  page,
}) => {
  const view = await open(page, required(games[1]));
  const cases = [
    { sequence: '4627351', nodes: ['Б', 'Г', 'Е', 'Ж'], count: '4' },
    { sequence: '3762415', nodes: ['В', 'Г', 'Е', 'Ж'], count: '2' },
    { sequence: '1234657', nodes: ['В', 'Д', 'Е', 'З'], count: '2' },
  ];
  for (const [index, example] of cases.entries()) {
    await choose(view.getByLabel('Уровень игры'), index);
    await view.getByLabel('Метки фрагментов URL').fill(example.sequence);
    await view.getByLabel('Всего допустимых путей').fill(example.count);
    const check = view.getByRole('button', {
      name: 'Проверить доставку и число путей',
    });
    await check.focus();
    await check.press('Enter');
    await expect(view).toContainText('Дойди до финиша');
    expect(
      (await savedLevels(page)).entries.flatMap((row) => row.levels),
    ).toHaveLength(index);
    for (const node of example.nodes) {
      const move = view.getByRole('button', {
        name: `В узел ${node}`,
        exact: true,
      });
      await move.focus();
      await move.press('Enter');
    }
    await check.focus();
    await check.press('Enter');
    await expect(view).toContainText(
      `Пройдено уровней: ${String(index + 1)} из 3`,
    );
    await expect(view).toContainText('Верно:');
    if (index === 2)
      await expect(view.getByRole('button', { name: 'В узел Ж' })).toHaveCount(
        0,
      );
  }
  await page.reload();
  await view.scrollIntoViewIfNeeded();
  await expect(view).toContainText('Пройдено уровней: 3 из 3');
});

for (const game of games) {
  test(`${game.id}: completes a level in 3D with paused and reduced motion controls`, async ({
    page,
    browserName,
  }) => {
    const view = await open(page, game);
    await view.getByLabel('Объёмная игра').check();
    if (browserName === 'chromium')
      await expect(
        view.locator('canvas[data-three-ready="true"]'),
      ).toBeVisible();
    else await expect(view.locator('[data-three-mode]')).toBeVisible();
    await view.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (browserName === 'chromium')
      await expect(view.locator('.three-stage')).toHaveAttribute(
        'data-three-running',
        'false',
      );
    if (game.id === 'bit-warehouse') {
      for (const [i, n] of [2, 1, 1].entries())
        await choose(view.locator(`select[id$="-cargo-${String(i)}"]`), n);
      await view.getByLabel('Всего бит в выбранном грузе').fill('352');
      await view.getByLabel('Всего байт в выбранном грузе').fill('44');
      if (browserName === 'chromium')
        await expect(view.locator('canvas')).toHaveAttribute(
          'aria-label',
          /Склад: 44 из 44 байт/u,
        );
      await view
        .getByRole('button', { name: 'Проверить упаковку и расчёт' })
        .click();
    } else {
      await view.getByLabel('Метки фрагментов URL').fill('4627351');
      for (const node of ['Б', 'Г', 'Е', 'Ж'])
        await view
          .getByRole('button', { name: `В узел ${node}`, exact: true })
          .click();
      await view.getByLabel('Всего допустимых путей').fill('4');
      if (browserName === 'chromium')
        await expect(view.locator('canvas')).toHaveAttribute(
          'aria-label',
          /Пакет в Ж/u,
        );
      await view
        .getByRole('button', { name: 'Проверить доставку и число путей' })
        .click();
    }
    await expect(view).toContainText('Пройдено уровней: 1 из 3');
    await expect(view).toContainText('Верно:');
  });

  test(`${game.id}: lazy 3D, context loss and switching views keep the current work`, async ({
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
    await view.getByLabel(game.input).fill('123');
    await view.getByLabel('Объёмная игра').focus();
    await page.keyboard.press('Space');
    if (browserName === 'chromium') {
      const canvas = view.locator('canvas[data-three-ready="true"]');
      await expect(canvas).toBeVisible();
      expect(entries).toHaveLength(1);
      if (game.id === 'packet-route') {
        await expect(view.locator('.three-node-label')).toHaveCount(7);
        await view
          .getByRole('button', { name: 'В узел Б', exact: true })
          .click();
        await expect(canvas).toHaveAttribute('aria-label', /Пакет в Б/u);
      }
      await canvas.evaluate((surface) => {
        if (!(surface instanceof HTMLCanvasElement))
          throw new Error('Нет canvas.');
        surface
          .getContext('webgl2')
          ?.getExtension('WEBGL_lose_context')
          ?.loseContext();
      });
      await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
      if (game.id === 'packet-route')
        await expect(view.locator('.three-node-label')).toHaveCount(0);
    } else await expect(view.locator('[data-three-mode]')).toBeVisible();
    await expect(view.getByLabel(game.input)).toHaveValue('123');
    await view.getByLabel('Объёмная игра').uncheck();
    await expect(view.locator('svg')).toBeVisible();
    await expect(view.getByLabel(game.input)).toHaveValue('123');
  });

  test(`${game.id}: no WebGL requests no heavy entry and preserves all controls`, async ({
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
    await expect(view.locator('svg')).toBeVisible();
    await choose(view.getByLabel('Уровень игры'), 2);
    await expect(view.getByLabel('Уровень игры')).toHaveValue('2');
    expect(entries).toHaveLength(0);
  });

  test(`${game.id}: failed 3D entry can be retried without losing input`, async ({
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
    await view.getByLabel(game.input).fill('456');
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
    await expect(view.getByLabel(game.input)).toHaveValue('456');
  });

  test(`${game.id}: both themes are accessible at 360px in 2D and 3D`, async ({
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
          (await new AxeBuilder({ page }).include(`#${game.id}`).analyze())
            .violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
  });

  test(`${game.id}: 20 native mounts free handles, contexts and DOM labels`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(installWebGLAudit);
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
    const harness = page.getByRole('region', {
      name: 'Повторное подключение и ошибки',
    });
    await harness.scrollIntoViewIfNeeded();
    await harness
      .getByLabel('Модуль для проверки')
      .selectOption({ label: game.label });
    for (let cycle = 0; cycle < 20; cycle++) {
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
      await expect(harness.locator('canvas')).toHaveCount(0);
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

test('all shared 3D code fits the 250 KB gzip budget; each light game entry stays below 80 KB', async () => {
  const files = await readdir('dist/_astro');
  async function graphBytes(entries: string[]) {
    const seen = new Set<string>();
    async function visit(file: string): Promise<number> {
      if (seen.has(file)) return 0;
      seen.add(file);
      const source = await readFile(`dist/_astro/${file}`, 'utf8');
      expect(source).not.toContain('кадров/с');
      let size = gzipSync(source).length;
      for (const [, dependency] of source.matchAll(
        /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/gu,
      ))
        if (dependency) size += await visit(dependency.slice(2));
      return size;
    }
    let bytes = 0;
    for (const entry of entries) bytes += await visit(entry);
    return bytes;
  }
  function entry(name: string) {
    const file = files.find((file) =>
      new RegExp(`^${name}\\.[\\w-]+\\.js$`, 'u').test(file),
    );
    if (!file) throw new Error(`Нет модуля ${name}.`);
    return file;
  }
  const shared = await graphBytes(
    [
      'BitCells3D',
      'Warehouse3D',
      'Packet3D',
      'Maze3D',
      'Sorting3D',
      'Gates3D',
    ].map(entry),
  );
  console.info(`T8.2 shared 3D graph: ${String(shared)} gzip bytes`);
  expect(shared).toBeLessThanOrEqual(250_000);
  for (const name of [
    'BitWarehouse',
    'PacketRoute',
    'RobotMaze',
    'SortingCenter',
    'LogicGates',
  ])
    expect(await graphBytes([entry(name)])).toBeLessThanOrEqual(80_000);
});
