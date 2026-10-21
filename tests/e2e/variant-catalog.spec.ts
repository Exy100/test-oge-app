import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
  variant13Alternatives,
  variantSeed,
} from '../../src/core/variants';
import { defaults, PREFIX, areaSchemas } from '../../src/core/storage/schemas';
import { variantTaskHref, readVariantSeed } from '../../src/lib/variant-links';

test('catalogue opens ten real variants, both №13 choices and the exact task in practice', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Варианты', exact: true })
    .click();
  await expect(page).toHaveURL(/\/variants\/$/u);
  const cards = page.locator('.variant-catalog-card');
  await expect(cards).toHaveCount(10);
  for (const [i, fixed] of fixedVariants.entries())
    await expect(cards.nth(i)).toHaveAttribute(
      'href',
      `/test-oge-app/variants/${fixed.id}/`,
    );
  await expect(page.getByRole('status')).toHaveText(
    'Сохранённых попыток пока нет.',
  );
  await cards.nth(2).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Вариант V03',
  );
  await expect(page.locator('.variant-task')).toHaveCount(16);
  const thirteen = page.locator('[data-task-number="13"]');
  await thirteen.locator(':scope > summary').click();
  await expect(
    thirteen.getByRole('heading', { name: '13.1 — Презентация' }),
  ).toBeVisible();
  await expect(
    thirteen.getByRole('heading', { name: '13.2 — Документ' }),
  ).toBeVisible();
  const variant = buildFixedVariant('V03');
  const document = variant13Alternatives(variantSeed(variant)).document;
  const link = thirteen.getByRole('link', {
    name: 'Решить задание №13.2 в практике',
    exact: true,
  });
  await expect(link).toHaveAttribute('href', variantTaskHref(document));
  await link.click();
  await expect(page.locator('.task-card h2')).toContainText('13.2');
  await expect(page.locator('.task-card .rich-text').first()).toContainText(
    document.statement.split('\n')[0] ?? '',
  );
  const history = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}') as {
        entries: unknown[];
      },
    PREFIX + 'variantAttempts',
  );
  expect(history.entries).toEqual([]);
});

test('fixed variants provide all conditions and both №13 choices without JavaScript', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing test site URL');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    expect((await page.goto(`${baseURL}variants/V10/`))?.status()).toBe(200);
    await expect(page.locator('.variant-task')).toHaveCount(16);
    await page.locator('[data-task-number="13"] > summary').click();
    await expect(
      page.getByRole('heading', { name: '13.2 — Документ' }),
    ).toBeVisible();
    await page.locator('[data-task-number="9"] > summary').click();
    await expect(
      page.locator('[data-task-number="9"]').getByRole('img'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Решить задание №16 в практике',
        exact: true,
      }),
    ).toBeHidden();
    await page.locator('[data-task-number="16"] > summary').click();
    await expect(
      page.getByRole('link', {
        name: 'Решить задание №16 в практике',
        exact: true,
      }),
    ).toBeVisible();
    expect((await page.goto(`${baseURL}variants/V11/`))?.status()).toBe(404);
  } finally {
    await context.close();
  }
});

test('random variant has a reproducible share URL, all sixteen tasks and another fresh seed', async ({
  page,
}) => {
  await page.goto('variants/');
  await page
    .getByRole('button', { name: 'Случайный вариант', exact: true })
    .click();
  await expect(page).toHaveURL(/\/variants\/random\/\?seed=/u);
  await expect(page.locator('.variant-task')).toHaveCount(16);
  const url = page.url();
  const seed = readVariantSeed(new URL(url).search);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://exy100.github.io/test-oge-app/variants/',
  );
  const variant = buildVariant(seed);
  await page.locator('[data-task-number="1"] > summary').click();
  await expect(page.locator('[data-task-number="1"] .rich-text')).toContainText(
    variant.tasks[0]?.statement ?? '',
  );
  const text = await page
    .locator('[data-task-number="1"] .rich-text')
    .innerText();
  await page.reload();
  await page.locator('[data-task-number="1"] > summary').click();
  await expect(page.locator('[data-task-number="1"] .rich-text')).toHaveText(
    text,
  );
  await page
    .getByRole('button', { name: 'Другой случайный вариант', exact: true })
    .click();
  await expect(page).not.toHaveURL(url);
  await expect(page.locator('.variant-task')).toHaveCount(16);
  const second = page.url();
  await page.goBack();
  await expect(page).toHaveURL(url);
  const again = page.getByRole('button', {
    name: 'Другой случайный вариант',
    exact: true,
  });
  await expect(again).toBeEnabled();
  await again.click();
  await expect(page).not.toHaveURL(url);
  await expect(page.locator('.variant-task')).toHaveCount(16);
  expect(page.url()).not.toBe(second);
});

test('random conditions load on demand, explain loading failure and preserve both №13 alternatives after reload', async ({
  page,
}) => {
  const seed = 'lazy-conditions';
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/RandomVariantContent\.[^/]+\.js/u.test(request.url()))
      requests.push(request.url());
  });
  await page.route(/\/RandomVariantContent\.[^/]+\.js/u, (route) =>
    route.abort(),
  );
  await page.goto(`variants/random/?seed=${seed}`);
  await expect(page.locator('.variant-task')).toHaveCount(16);
  await expect(page.locator('.variant-task .rich-text')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const thirteen = page.locator('[data-task-number="13"]');
  await thirteen.locator(':scope > summary').click();
  await expect(thirteen.getByRole('alert')).toContainText(
    'Не удалось открыть условия',
  );
  await expect(thirteen.locator('.rich-text')).toHaveCount(0);
  await page.unroute(/\/RandomVariantContent\.[^/]+\.js/u);
  await page.reload();
  await thirteen.locator(':scope > summary').click();
  await expect(
    thirteen.getByRole('heading', { name: '13.1 — Презентация' }),
  ).toBeVisible();
  await expect(
    thirteen.getByRole('heading', { name: '13.2 — Документ' }),
  ).toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.at(-1)).not.toBe(requests[0]);
  expect(new URL(requests.at(-1) ?? '').pathname).toBe(
    new URL(requests[0] ?? '').pathname,
  );
  await expect(
    thirteen.getByRole('link', { name: 'Решить задание №13.2 в практике' }),
  ).toHaveAttribute(
    'href',
    variantTaskHref(variant13Alternatives(seed).document),
  );
});

test('malformed random links and failed module loading explain recovery without false tasks', async ({
  page,
}) => {
  for (const search of ['', '?seed=a&seed=b', '?seed=' + 'x'.repeat(201)]) {
    await page.goto(`variants/random/${search}`);
    await expect(page.getByRole('alert')).toContainText(/Ссылка на вариант/u);
    await expect(page.locator('.variant-task')).toHaveCount(0);
  }
  await page.route('**/RandomVariantBody.*.js', (route) =>
    route.abort('failed'),
  );
  await page.goto('variants/random/?seed=unavailable-module');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось собрать вариант',
  );
  await expect(page.locator('.variant-task')).toHaveCount(0);
});

test('history reads actual browser records, preserves zero and missing scores, and updates across tabs', async ({
  page,
  context,
}) => {
  const data = defaults().variantAttempts;
  const common = {
    seed: fixedVariants[0]?.seed ?? '',
    variantId: 'V01',
    variant13: 'document' as const,
    mode: 'exam' as const,
    startedAt: '2026-10-18T01:00:00Z',
    elapsedMs: 3600000,
    answers: [],
    assessments: [],
    marked: [],
  };
  data.entries = [
    { ...common, id: 'older', finishedAt: '2026-10-18T02:00:00Z', score: 0 },
    {
      ...common,
      id: 'explicit-zero',
      finishedAt: '2026-10-18T02:30:00Z',
      score: 0,
      assessments: [
        { taskNumber: 13, score: 0, source: 'self' },
        { taskNumber: 14, score: 0, source: 'self' },
        { taskNumber: 15, score: 0, source: 'self' },
        { taskNumber: 16, score: 0, source: 'self' },
      ],
    },
    {
      ...common,
      id: 'newer',
      mode: 'training',
      finishedAt: '2026-10-18T03:00:00Z',
      score: null,
    },
  ];
  areaSchemas.variantAttempts.parse(data);
  await page.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: PREFIX + 'variantAttempts', data },
  );
  await page.goto('variants/');
  const rows = page.locator('.variant-history-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Без итогового балла');
  await expect(rows.nth(1)).toContainText('0 из 21');
  await expect(rows.nth(2)).toContainText('Без итогового балла');
  await expect(rows.nth(2)).toContainText('Практика оценена не полностью');
  await expect(rows.nth(0)).toContainText('Работа №13.2');
  const other = await context.newPage();
  await other.goto('variants/');
  await other.evaluate(
    ({ key }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, entries: [] }));
    },
    { key: PREFIX + 'variantAttempts' },
  );
  await expect(page.getByRole('status')).toHaveText(
    'Сохранённых попыток пока нет.',
  );
  await other.close();
});

test('catalogue, open fixed and random conditions stay accessible in both themes and at 360px/200%', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      /content.security.policy|violat.*(?:policy|directive)/iu.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  for (const path of [
    'variants/',
    'variants/V01/',
    'variants/random/?seed=accessible-variant',
  ]) {
    await page.goto(path);
    if (path.includes('random'))
      await expect(page.locator('.variant-task')).toHaveCount(16);
    await page.evaluate(() => {
      for (const details of document.querySelectorAll('details'))
        details.open = true;
    });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
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
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .every((entry) => new URL(entry.name).origin === location.origin),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  }
});

for (const failure of ['blocked', 'corrupted']) {
  test(`${failure} browser storage keeps the fixed catalogue usable and reports the issue`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ failure, key }) => {
        if (failure === 'blocked')
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Blocked', 'SecurityError');
            },
          });
        else localStorage.setItem(key, 'damaged history');
      },
      { failure, key: PREFIX + 'variantAttempts' },
    );
    await page.goto('variants/');
    await expect(page.locator('#storage-notice')).toContainText(
      failure === 'blocked'
        ? 'Хранилище недоступно'
        : 'Повреждены данные «история вариантов»',
    );
    await expect(page.locator('.variant-catalog-card')).toHaveCount(10);
    await page.locator('.variant-catalog-card').first().click();
    await expect(page.locator('.variant-task')).toHaveCount(16);
  });
}
