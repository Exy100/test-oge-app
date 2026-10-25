import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { lessonTask } from '../../src/lib/lessons/content';
import { directedMaps } from '../../src/lib/interactives/graphs';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const graphLessons = preparationLessons.filter((lesson) =>
  ['i3', 'i4'].includes(lesson.section),
);
async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}

test('logic builder constructs equivalent expressions and checks every input, not only the selected one', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i3/logic-operations/',
    'logic-builder',
  );
  const check = scene.getByRole('button', {
    name: 'Проверить эквивалентность',
  });
  await check.focus();
  await check.press('Enter');
  await expect(scene).toContainText('При A=1, B=0');
  await scene.getByRole('button', { name: 'Очистить выражение' }).click();
  for (const name of ['Добавить B', 'Добавить И', 'Добавить A'])
    await scene.getByRole('button', { name, exact: true }).press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('совпадают на всех четырёх наборах');
  await scene.getByLabel('A истинно', { exact: true }).check();
  await scene.getByLabel('B истинно', { exact: true }).check();
  await expect(scene.locator('tr[data-current="true"]')).toHaveText(
    '1111Выбран',
  );
  await scene
    .getByLabel('Твоё выражение', { exact: true })
    .fill('НЕ (НЕ A ИЛИ НЕ B)');
  // Enter alone after a programmatic focus does not establish keyboard focus
  // visibility in Firefox. Navigate from the preceding focusable table.
  await scene.getByRole('region', { name: 'Таблица истинности' }).focus();
  await page.keyboard.press('Tab');
  await expect(check).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(scene).toContainText('совпадают на всех четырёх наборах');
  await expect(check).toHaveCSS('outline-style', 'solid');
});

test('negation scope, malformed expressions, keyboard, reduced motion and pause remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i3/logic-negation/',
    'logic-builder',
  );
  const expression = scene.getByLabel('Твоё выражение', { exact: true }),
    check = scene.getByRole('button', { name: 'Проверить эквивалентность' });
  await expression.fill('НЕ A ИЛИ НЕ B');
  await check.press('Enter');
  await expect(scene).toContainText('Пока неэквивалентно');
  await expression.fill('НЕ A И НЕ B');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: выражения');
  await expression.fill('A && B');
  await expect(scene.getByRole('alert')).toBeVisible();
  await expect(check).toBeDisabled();
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expression.fill('НЕ (A ИЛИ B)');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: выражения');
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(expression).toHaveValue('НЕ (A ИЛИ B)');
});

test('graph route accepts both shortest paths and rejects a direct longer one', async ({
  page,
}, info) => {
  const scene = await openScene(
    page,
    'materials/i4/graph-models/',
    'shortest-path',
  );
  expect(
    await scene.locator('.teaching-graph').evaluate((svg) => {
      const labels = Array.from(
        svg.querySelectorAll('g[data-selected] > rect'),
      ).map((rect) => (rect as SVGRectElement).getBBox());
      return labels.every((a, index) =>
        labels
          .slice(index + 1)
          .every(
            (b) =>
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          ),
      );
    }),
  ).toBe(true);
  const check = scene.getByRole('button', { name: 'Проверить путь' }),
    reset = scene.getByRole('button', { name: 'Начать путь заново' });
  await scene
    .getByRole('button', { name: 'Перейти в Е', exact: true })
    .press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Есть более короткий путь');
  for (const route of [
    ['Б', 'Г', 'Е'],
    ['В', 'Д', 'Е'],
  ]) {
    await reset.press('Enter');
    for (const node of route)
      await scene
        .getByRole('button', { name: `Перейти в ${node}`, exact: true })
        .press('Enter');
    await check.press('Enter');
    await expect(scene).toContainText(
      'Верно: этот путь кратчайший, его длина 7 км',
    );
    await expect(
      scene.locator('.teaching-graph g[data-selected="true"]'),
    ).toHaveCount(3);
  }
  const reveal = scene.getByRole('button', {
    name: 'Показать один кратчайший путь',
  });
  if (info.project.name === 'mobile') await reveal.tap();
  else await reveal.click();
  await expect(scene).toContainText('Один из кратчайших');
});

test('closest-neighbour choice is not accepted when the whole route is longer', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i4/shortest-route/',
    'shortest-path',
  );
  const check = scene.getByRole('button', { name: 'Проверить путь' });
  for (const node of ['Б', 'Г', 'Е'])
    await scene
      .getByRole('button', { name: `Перейти в ${node}`, exact: true })
      .click();
  await check.click();
  await expect(scene).toContainText('минимальная длина — 6 км');
  await scene.getByRole('button', { name: 'Начать путь заново' }).click();
  for (const node of ['В', 'Д', 'Е'])
    await scene
      .getByRole('button', { name: `Перейти в ${node}`, exact: true })
      .click();
  await check.click();
  await expect(scene).toContainText('Верно: этот путь кратчайший');
  await expect(
    scene.getByRole('button', { name: 'Перейти в Б', exact: true }),
  ).toBeDisabled();
});

test('path counts use incoming arrows and preserve zero at an isolated finish', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i4/directed-paths/',
    'path-count',
  );
  const check = scene.getByRole('button', { name: 'Проверить подсчёт' });
  await check.press('Enter');
  await expect(scene).toContainText('Проверь вершину Б');
  for (const preset of ['fork', 'merge'] as const) {
    await scene
      .getByLabel('Направленная схема', { exact: true })
      .selectOption(preset);
    const graph = directedMaps[preset],
      end = graph.nodes.at(-1) ?? '';
    function count(node: string, closed: boolean): number {
      if (node === 'А') return 1;
      return graph.edges
        .filter(
          ([from, to]) => to === node && (!closed || to !== end) && from !== to,
        )
        .reduce((sum, [from]) => sum + count(from, closed), 0);
    }
    for (const closed of [false, true]) {
      await scene
        .getByLabel('Убрать все стрелки в финиш', { exact: true })
        .setChecked(closed);
      for (const node of graph.nodes.slice(1))
        await scene
          .getByLabel(`Путей в ${node}`, { exact: true })
          .fill(String(count(node, closed)));
      await check.press('Enter');
      await expect(scene).toContainText(
        `Из А в ${end} ведёт путей: ${String(count(end, closed))}`,
      );
    }
    await scene
      .getByRole('button', { name: 'Следующая вершина' })
      .press('Enter');
    await expect(scene).toContainText('Открытые значения: А = 1; Б = 1');
    await scene
      .getByRole('button', { name: 'Сбросить подсчёт' })
      .press('Enter');
    await expect(scene.getByLabel('Путей в Б', { exact: true })).toHaveValue(
      '',
    );
  }
});

test('graph scene imports are lazy and only the selected entry loads', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (
      /\/(?:LogicBuilder|ShortestPath|PathCount)\.[^/]+\.js/u.test(
        request.url(),
      )
    )
      requested.push(request.url());
  });
  await page.goto('materials/i4/shortest-route/');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  expect(requested).toHaveLength(0);
  const scene = page.locator('#shortest-path');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  expect(requested).toHaveLength(1);
  expect(requested[0]).toContain('/ShortestPath.');
});
for (const lesson of graphLessons) {
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
        /generatorId: '([^']+)',\s*taskNumber: ([349]),\s*seed: '([^']+)'/gu,
      ),
    ).at(-1);
    if (!match?.[1] || !match[2] || !match[3])
      throw new Error('Нет источника последнего вопроса.');
    const source = {
      generatorId: match[1],
      taskNumber: Number(match[2]) as 3 | 4 | 9,
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
      lesson.id === 'graph-models' ? '4,9' : String(lesson.taskNumber),
    );
    expect(errors).toEqual([]);
  });
}

for (const [title, module] of [
  ['Логика', 'LogicBuilder'],
  ['Кратчайший путь', 'ShortestPath'],
  ['Число путей', 'PathCount'],
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
  for (const name of ['LogicBuilder', 'ShortestPath', 'PathCount']) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: all six logic and graph lessons are accessible at 360 px without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.addInitScript((theme) => {
      localStorage.setItem(
        'oge:informatics:v1:settings',
        JSON.stringify({ version: 1, theme, fontSize: 100, animations: false }),
      );
    }, theme);
    for (const lesson of graphLessons) {
      await page.goto(lesson.route.slice(1));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const scene = page.locator('.lesson-interactive');
      await scene.scrollIntoViewIfNeeded();
      await expect(scene.locator('.information-lab')).toBeVisible();
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
    }
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
  for (const lesson of graphLessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternative = page.locator('.interactive-alternative');
    await alternative.locator('summary').click();
    await expect(alternative.locator('div')).toBeVisible();
    await page.locator('#example-1 [data-lesson-example] > summary').click();
    await expect(page.locator('#example-1 .lesson-steps > li')).toHaveCount(3);
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.locator('#example-1 .lesson-steps > li').last(),
    ).toBeVisible();
    await expect(page.locator('.interactive-screen')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  }
  await context.close();
});
