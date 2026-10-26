import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { lessonTask } from '../../src/lib/lessons/content';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { regionNames } from '../../src/lib/interactives/search';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const networkLessons = preparationLessons.filter((lesson) =>
  ['i7', 'i8'].includes(lesson.section),
);
async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}
test('address builder checks exact separators, every fragment and keyboard/touch editing', async ({
  page,
}, info) => {
  const scene = await openScene(
    page,
    'materials/i7/network-resources/',
    'resource-address',
  );
  const input = scene.getByLabel('Последовательность меток 1–7'),
    check = scene.getByRole('button', { name: 'Проверить адрес' });
  await input.fill('1234567');
  await check.press('Enter');
  await expect(scene).toContainText('Пока адрес не совпал');
  await input.fill('11');
  await expect(scene.getByRole('alert')).toBeVisible();
  await expect(check).toBeDisabled();
  await scene.getByRole('button', { name: 'Очистить адрес' }).press('Enter');
  for (const digit of ['4', '6', '2', '7', '3', '5', '1'])
    await scene
      .getByRole('button', { name: new RegExp('^' + digit + ':', 'u') })
      .press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: все фрагменты');
  await expect(check).toHaveCSS('outline-style', 'solid');
  await scene
    .getByRole('button', { name: 'Убрать последний фрагмент' })
    .press('Enter');
  await expect(check).toBeDisabled();
  const add = scene.getByRole('button', { name: '1: .txt', exact: true });
  if (info.project.use.hasTouch === true) await add.tap();
  else await add.click();
  await expect(input).toHaveValue('4627351');
  expect(await scene.locator('a[href^="http"]').count()).toBe(0);
});
test('both valid permutations and FTP work with pause and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
      page,
      'materials/i7/restore-address/',
      'resource-address',
    ),
    input = scene.getByLabel('Последовательность меток 1–7'),
    check = scene.getByRole('button', { name: 'Проверить адрес' });
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  for (const value of ['1234567', '1234657']) {
    await input.fill(value);
    await check.press('Enter');
    await expect(scene).toContainText('Верно: все фрагменты');
  }
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(input).toHaveValue('1234657');
  await scene.getByLabel('Набор фрагментов URL').selectOption('ftp');
  await expect(input).toHaveValue('');
  await input.fill('3762415');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: все фрагменты');
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
});
test('conditional search accepts distributed form and rejects missing parentheses on every membership', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i8/venn-diagrams/',
    'search-sets',
  );
  const input = scene.getByLabel('Твой поисковый запрос'),
    check = scene.getByRole('button', {
      name: 'Проверить запрос',
      exact: true,
    });
  await scene.getByRole('button', { name: 'Очистить запрос' }).press('Enter');
  for (const token of ['A', '&', '(', 'B', '|', 'C', ')'])
    await scene
      .getByRole('button', { name: `Добавить ${token}`, exact: true })
      .press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: запрос совпадает');
  await expect(
    scene.locator('svg g[data-region][data-selected="true"]'),
  ).toHaveCount(3);
  await input.fill('А И В ИЛИ А И С');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: запрос совпадает');
  await input.fill('A & B | C');
  await check.press('Enter');
  await expect(scene).toContainText('Пока запрос отличается');
  await scene.getByLabel('Страниц: Только C', { exact: true }).fill('0');
  await check.press('Enter');
  await expect(scene).toContainText('Пока запрос отличается');
  await input.fill('A & (B | C)');
  await scene.getByLabel('Сколько страниц найдёт целевой запрос?').fill('21');
  await scene
    .getByRole('button', { name: 'Проверить количество' })
    .press('Enter');
  await expect(scene).toContainText('Верно: количество');
});
test('both exam questions, zero intersection, impossible counts and query errors give real feedback', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i8/count-search-results/',
    'search-sets',
  );
  const goal = scene.getByLabel('Цель поискового запроса'),
    input = scene.getByLabel('Твой поисковый запрос'),
    answer = scene.getByLabel('Сколько страниц найдёт целевой запрос?'),
    check = scene.getByRole('button', { name: 'Проверить количество' }),
    query = scene.getByRole('button', {
      name: 'Проверить запрос',
      exact: true,
    });
  await input.fill('A & C');
  await query.press('Enter');
  await expect(scene).toContainText('Верно: запрос совпадает');
  await answer.fill('15');
  await check.press('Enter');
  await expect(scene).toContainText('Пока неверно');
  await answer.fill('16');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: количество');
  await goal.selectOption('triple');
  await input.fill('A & B & C');
  await answer.fill('9');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: количество');
  for (const name of regionNames)
    await scene.getByLabel(`Страниц: ${name}`, { exact: true }).fill('0');
  await input.fill('A');
  await query.press('Enter');
  await expect(scene).toContainText('даже если эта область сейчас пустая');
  await answer.fill('0');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: количество');
  await scene.getByLabel('Страниц: Только A', { exact: true }).fill('10001');
  await expect(scene.getByRole('alert')).toBeVisible();
  await expect(check).toBeDisabled();
  await scene.getByRole('button', { name: 'Вернуть исходную базу' }).click();
  await input.fill('A && B');
  await expect(scene.getByRole('alert')).toBeVisible();
});
test('complement includes only the stated universe and preserves manual state offscreen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i8/search-operations/',
    'search-sets',
  );
  const input = scene.getByLabel('Твой поисковый запрос');
  await input.fill('НЕ (A | B | C)');
  await expect(scene.locator('svg g[data-region="0"]')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(
    scene.locator('svg g[data-region][data-selected="true"]'),
  ).toHaveCount(1);
  await expect(scene).toContainText('Он нашёл страниц: 2');
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(input).toHaveValue('НЕ (A | B | C)');
});
test('only the selected scene module loads after becoming visible', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (/\/(?:ResourceAddress|SearchSets)\.[^/]+\.js/u.test(request.url()))
      requested.push(request.url());
  });
  await page.goto('materials/i7/url-parts/');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  expect(requested).toHaveLength(0);
  const scene = page.locator('#resource-address');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  expect(requested).toHaveLength(1);
  expect(requested[0]).toContain('/ResourceAddress.');
});
for (const lesson of networkLessons) {
  test(`${lesson.id}: complete lesson, generated quiz, contents, practice and keyboard example`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(lesson.route.slice(1));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      lesson.title,
    );
    await expect(page.locator('#theory svg')).toHaveCount(2);
    expect(
      await page.locator('#theory svg').evaluateAll((figures) =>
        figures.every((figure) => {
          const texts = Array.from(figure.querySelectorAll('text'));
          return (
            texts.length > 0 &&
            texts.every(
              (text) =>
                text.namespaceURI === 'http://www.w3.org/2000/svg' &&
                text.textContent.trim() &&
                text.children.length === 0,
            )
          );
        }),
      ),
    ).toBe(true);
    await expect(page.locator('.lesson-example')).toHaveCount(3);
    await expect(page.locator('.lesson-question')).toHaveCount(5);
    const toc = page.getByRole('navigation', { name: 'Содержание урока' });
    for (const link of await toc.getByRole('link').all()) {
      const href = await link.getAttribute('href');
      if (!href) throw new Error('Нет адреса оглавления.');
      await expect(page.locator(href)).toHaveCount(1);
    }
    const example = page.locator('#example-1');
    await example.locator('[data-lesson-example] > summary').focus();
    await example.locator('[data-lesson-example] > summary').press('Enter');
    const next = example.getByRole('button', { name: 'Следующий шаг' });
    await next.focus();
    await next.press('Enter');
    await expect(example.locator('.lesson-steps > li').nth(1)).toBeFocused();
    const question = page.locator('#question-1');
    await question.scrollIntoViewIfNeeded();
    await expect(
      question.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await question.getByRole('radio').first().focus();
    await question.getByRole('radio').first().press('Space');
    await question
      .getByRole('button', { name: 'Проверить ответ' })
      .press('Enter');
    await expect(question.locator('.lesson-feedback')).toHaveAttribute(
      'data-verdict',
      'correct',
    );
    const file = await readFile(
      `src/content/lessons/${lesson.section}/${lesson.id}.mdx`,
      'utf8',
    );
    const match = Array.from(
      file.matchAll(
        /generatorId: '([^']+)',\s*taskNumber: ([78]),\s*seed: '([^']+)'/gu,
      ),
    ).at(-1);
    if (!match?.[1] || !match[2] || !match[3])
      throw new Error('Нет источника последнего вопроса.');
    const source = {
      generatorId: match[1],
      taskNumber: Number(match[2]) as 7 | 8,
      seed: match[3],
    };
    const task = lessonTask(source).task;
    const answer = solveParameters(parseGeneratedProblem(task))?.[0];
    if (!answer) throw new Error('Нет независимого ответа.');
    const exam = page.locator('#question-5');
    await exam.scrollIntoViewIfNeeded();
    await expect(
      exam.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await exam.getByLabel('Твой ответ').fill(answer);
    await exam.getByLabel('Твой ответ').press('Enter');
    await expect(exam.locator('.lesson-feedback')).toHaveAttribute(
      'data-verdict',
      'correct',
    );
    const href = await page
      .getByRole('link', { name: 'Перейти к заданиям' })
      .getAttribute('href');
    if (!href) throw new Error('Нет ссылки практики.');
    expect(new URL(href, page.url()).searchParams.get('numbers')).toBe(
      String(lesson.taskNumber),
    );
    expect(errors).toEqual([]);
  });
}

for (const [title, module] of [
  ['Адрес ресурса', 'ResourceAddress'],
  ['Поисковые множества', 'SearchSets'],
] as const) {
  test(`${module}: twenty real mount/unmount cycles release native resources`, async ({
    page,
  }) => {
    await page.addInitScript(installInteractiveAudit);
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
    await page.locator('#bits-probe').scrollIntoViewIfNeeded();
    await expect(page.locator('#bits-probe [data-probe-ready]')).toBeVisible();
    await page
      .locator('#bits-probe')
      .getByRole('button', { name: 'Пауза', exact: true })
      .click();
    const harness = page.getByRole('region', {
      name: 'Повторное подключение и ошибки',
    });
    await harness.scrollIntoViewIfNeeded();
    await expect(harness.getByLabel('Модуль для проверки')).toBeEnabled();
    await harness
      .getByLabel('Модуль для проверки')
      .selectOption({ label: title });
    await expect(page.locator('#bits-probe .interactive-host')).toHaveAttribute(
      'data-interactive-active',
      'false',
    );
    await expect
      .poll(() => page.evaluate(() => window.interactiveResources().frames))
      .toBe(0);
    const baseline = await page.evaluate(() => window.interactiveResources());
    for (let cycle = 0; cycle < 20; cycle++) {
      await harness
        .getByRole('button', { name: 'Подключить сцену', exact: true })
        .click();
      await expect(harness.locator('.information-lab')).toBeVisible();
      const mounted = await page.evaluate(() => window.interactiveResources());
      expect(mounted.intersections).toBe(baseline.intersections + 1);
      expect(mounted.mutations).toBe(baseline.mutations + 1);
      expect(mounted.intervals).toBe(0);
      expect(mounted.frames).toBe(0);
      await harness
        .getByRole('button', { name: 'Отключить сцену', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.interactiveResources()))
        .toEqual(baseline);
    }
  });
}

test('each 2D entry including all its imported JavaScript stays below 80 KB gzip', async () => {
  const files = await readdir('dist/_astro');
  async function moduleBytes(file: string, seen: Set<string>): Promise<number> {
    if (seen.has(file)) return 0;
    seen.add(file);
    const source = await readFile(join('dist/_astro', file), 'utf8');
    let bytes = gzipSync(source).length;
    for (const [, imported] of source.matchAll(
      /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/gu,
    )) {
      if (!imported) throw new Error('Не найден импорт.');
      bytes += await moduleBytes(imported.slice(2), seen);
    }
    return bytes;
  }
  for (const name of ['ResourceAddress', 'SearchSets']) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  for (const lesson of networkLessons)
    test(`${theme}: ${lesson.id} is accessible at 360 px without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.addInitScript((theme) => {
        localStorage.setItem(
          'oge:informatics:v1:settings',
          JSON.stringify({
            version: 1,
            theme,
            fontSize: 100,
            animations: false,
          }),
        );
      }, theme);
      await page.goto(lesson.route.slice(1));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const scene = page.locator('.lesson-interactive');
      for (const instance of await scene.all()) {
        await instance.scrollIntoViewIfNeeded();
        await expect(instance.locator('.information-lab')).toBeVisible();
      }
      // Check the full rendered document, including all examples and quiz controls.
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const table of await scene.locator('.lab-table-scroll').all()) {
        await table.focus();
        await expect(table).toBeFocused();
        if (
          await table.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          )
        ) {
          await table.press('ArrowRight');
          await expect
            .poll(() => table.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        }
      }
      expect(
        await page
          .locator('#theory svg text, .information-lab svg text')
          .evaluateAll((labels) =>
            labels.every((element) => {
              if (!(element instanceof SVGTextElement)) return false;
              const bounds = element.getBBox(),
                frame = element.ownerSVGElement?.viewBox.baseVal;
              return (
                frame !== undefined &&
                bounds.width > 0 &&
                bounds.y >= 0 &&
                bounds.x >= 0 &&
                bounds.x + bounds.width <= frame.width &&
                bounds.y + bounds.height <= frame.height
              );
            }),
          ),
      ).toBe(true);
    });
}

test('all lessons retain theory, solved examples and scene alternatives without JavaScript and in print', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  for (const lesson of networkLessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternatives = page.locator('.interactive-alternative');
    await expect(alternatives).toHaveCount(
      lesson.id === 'restore-address' ? 2 : 1,
    );
    for (const alternative of await alternatives.all()) {
      await alternative.locator('summary').click();
      await expect(alternative.locator('div')).toBeVisible();
    }
    await page.locator('#example-1 [data-lesson-example] > summary').click();
    await expect(page.locator('#example-1 .lesson-steps > li')).toHaveCount(3);
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.locator('#example-1 .lesson-steps > li').last(),
    ).toBeVisible();
    for (const screen of await page.locator('.interactive-screen').all())
      await expect(screen).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  }
  await context.close();
});

test('production scene screenshots at mobile and desktop widths', async ({
  page,
}, info) => {
  await mkdir('.cache/t7-8-screens', { recursive: true });
  for (const [route, id] of [
    ['materials/i7/restore-address/', 'resource-address'],
    ['materials/i8/count-search-results/', 'search-sets'],
  ]) {
    if (!route || !id) throw new Error('Нет сцены.');
    const scene = await openScene(page, route, id);
    await scene.screenshot({
      path: `.cache/t7-8-screens/${id}-${info.project.name}.png`,
    });
    await page
      .locator('#theory svg')
      .first()
      .screenshot({
        path: `.cache/t7-8-screens/${id}-theory-${info.project.name}.png`,
      });
  }
});
