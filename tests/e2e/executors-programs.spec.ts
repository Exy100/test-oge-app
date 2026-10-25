import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { lessonTask } from '../../src/lib/lessons/content';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const programLessons = preparationLessons.filter((lesson) =>
  ['i5', 'i6'].includes(lesson.section),
);
async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}
test('executor accepts all alternative solutions, manual steps and keyboard editing', async ({
  page,
}, info) => {
  const scene = await openScene(
    page,
    'materials/i5/executor-commands/',
    'fixed-executor',
  );
  const program = scene.getByLabel('Программа из команд 1 и 2'),
    check = scene.getByRole('button', { name: 'Проверить программу' });
  for (const answer of ['11', '21', '122', '222']) {
    await program.fill(answer);
    await check.press('Enter');
    await expect(scene).toContainText('Верно: программа достигает цели');
  }
  await scene
    .getByRole('button', { name: 'Очистить программу' })
    .press('Enter');
  await expect(check).toBeDisabled();
  for (const command of ['1', '1'])
    await scene
      .getByRole('button', { name: `Добавить команду ${command}` })
      .press('Enter');
  const next = scene.getByRole('button', {
    name: 'Следующая команда',
    exact: true,
  });
  await next.press('Enter');
  await expect(
    scene.getByRole('status').filter({ hasText: 'Шаг 1:' }),
  ).toContainText('4');
  await next.press('Enter');
  await expect(next).toBeDisabled();
  await expect(
    scene.getByRole('status').filter({ hasText: 'Шаг 2:' }),
  ).toContainText('8');
  await scene
    .getByRole('button', { name: 'Предыдущая команда', exact: true })
    .press('Enter');
  await expect(scene).toContainText('Шаг 1: 4');
  await program.fill('111111');
  await expect(scene.getByRole('alert')).toContainText('до пяти команд');
  await expect(check).toBeDisabled();
  await program.fill('1');
  await check.press('Enter');
  await expect(scene).toContainText('Пока не подходит');
  await expect(check).toHaveCSS('outline-style', 'solid');
  const add = scene.getByRole('button', { name: 'Добавить команду 2' });
  if (info.project.name === 'mobile') await add.tap();
  else await add.click();
  await expect(program).toHaveValue('12');
});
test('square executor preserves state across pause, reduced motion and offscreen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i5/executor-reverse/',
    'fixed-executor',
  );
  const program = scene.getByLabel('Программа из команд 1 и 2'),
    check = scene.getByRole('button', { name: 'Проверить программу' });
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  for (const answer of ['11', '21']) {
    await program.fill(answer);
    await check.press('Enter');
    await expect(scene).toContainText('Верно: программа достигает цели');
  }
  await program.fill('12');
  await check.press('Enter');
  await expect(scene).toContainText('получено 6, цель — 16');
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(program).toHaveValue('12');
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
});
test('tracer updates assignments in order and follows loops including zero iterations', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i6/program-variables/',
    'program-tracer',
  );
  await expect(scene.locator('.program-code')).toHaveCSS(
    'list-style-type',
    'decimal',
  );
  const next = scene.getByRole('button', { name: 'Следующий шаг программы' }),
    previous = scene.getByRole('button', { name: 'Предыдущий шаг программы' }),
    prediction = scene.getByLabel('Какой будет вывод?'),
    check = scene.getByRole('button', { name: 'Проверить прогноз' });
  await prediction.fill('12');
  await check.press('Enter');
  await expect(scene).toContainText('Пока неверно');
  await prediction.fill('48');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: прогноз');
  for (let step = 0; step < 4; step++) await next.press('Enter');
  await expect(scene.locator('li[aria-current="step"]')).toContainText(
    'y = (x - y)',
  );
  await expect(
    scene.getByRole('status').filter({ hasText: 'Шаг 4.' }),
  ).toContainText('x = 8; y = 6');
  await previous.press('Enter');
  await expect(
    scene.getByRole('status').filter({ hasText: 'Шаг 3.' }),
  ).toContainText('x = 8; y = 2');
  const kind = scene.getByLabel('Программа для трассировки');
  for (const mode of ['for', 'while']) {
    await kind.selectOption(mode);
    await scene.getByLabel('Ввод: n', { exact: true }).fill('0');
    await prediction.fill('0');
    await check.press('Enter');
    await expect(scene).toContainText('Верно: прогноз');
    await expect(scene.locator('li[aria-current="step"]')).toHaveCount(0);
    for (let step = 0; step < 4; step++) await next.press('Enter');
    await expect(next).toBeDisabled();
    await expect(
      scene.getByRole('status').filter({ hasText: 'Шаг 4.' }),
    ).toContainText('Вывод: 0');
  }
  await scene.getByLabel('Ввод: n', { exact: true }).fill('10203');
  await prediction.fill('6');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: прогноз');
  await scene.getByLabel('Ввод: n', { exact: true }).fill('-1');
  await expect(scene.getByRole('alert')).toBeVisible();
});
test('nine runs check minimum, maximum and every allowed parameter with strict boundaries', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i6/program-conditions/',
    'program-tracer',
  );
  const a = scene.getByLabel('Параметр A', { exact: true }),
    mode = scene.getByLabel('Какой параметр требуется?'),
    check = scene.getByRole('button', { name: 'Проверить параметр' });
  await expect(
    scene
      .getByRole('region', { name: 'Девять независимых запусков' })
      .locator('tbody tr'),
  ).toHaveCount(9);
  for (const [requirement, values] of [
    ['min', ['2']],
    ['max', ['4']],
    ['any', ['2', '3', '4']],
  ] as const) {
    await mode.selectOption(requirement);
    for (const value of values) {
      await a.fill(value);
      await check.press('Enter');
      await expect(scene).toContainText('Верно: параметр удовлетворяет');
    }
  }
  await mode.selectOption('min');
  await a.fill('3');
  await check.press('Enter');
  await expect(scene).toContainText('проверь требование минимума');
  for (const value of ['1', '5']) {
    await a.fill(value);
    await check.press('Enter');
    await expect(scene).toContainText('Пока не подходит: YES получилось');
  }
  await a.fill('2');
  await scene.getByLabel('Запуск для пошагового просмотра').selectOption('3');
  await scene.getByLabel('Какой будет вывод?').fill('NO');
  await scene.getByRole('button', { name: 'Проверить прогноз' }).press('Enter');
  await expect(scene).toContainText('Верно: прогноз');
  const next = scene.getByRole('button', { name: 'Следующий шаг программы' });
  for (let step = 0; step < 3; step++) await next.press('Enter');
  await expect(scene).toContainText('Условие: ложь');
  await next.press('Enter');
  await expect(scene.locator('li[aria-current="step"]')).toContainText(
    'print("NO")',
  );
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await a.fill('4');
  await mode.selectOption('max');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: параметр удовлетворяет');
  await a.fill('1.5');
  await expect(scene.getByRole('alert')).toBeVisible();
  await expect(check).toHaveCount(0);
  await scene.getByLabel('Программа для трассировки').selectOption('assign');
  await expect(scene.getByRole('alert')).toHaveCount(0);
  await expect(scene.getByLabel('Какой будет вывод?')).toBeVisible();
});
test('new scene modules are lazy and only the selected module loads', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (/\/(?:FixedExecutor|ProgramTracer)\.[^/]+\.js/u.test(request.url()))
      requested.push(request.url());
  });
  await page.goto('materials/i6/program-variables/');
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toBeEnabled();
  expect(requested).toHaveLength(0);
  const scene = page.locator('#program-tracer');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  expect(requested).toHaveLength(1);
  expect(requested[0]).toContain('/ProgramTracer.');
});
for (const lesson of programLessons) {
  test(`${lesson.id}: complete lesson, generated quiz, contents, practice and keyboard example`, async ({
    page,
  }, info) => {
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
    if (lesson.id === 'executor-reverse') {
      const reverse = page.getByRole('table', {
        name: 'Возвращаемся от цели к началу',
      });
      await expect(reverse).toContainText('√16 = 4');
      await expect(reverse).toContainText('4 − 2 = 2');
      await expect(reverse.getByRole('row')).toHaveCount(3);
      await mkdir('.cache/t7-7-screens', { recursive: true });
      await reverse.screenshot({
        path: `.cache/t7-7-screens/reverse-table-${info.project.name}.png`,
      });
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
        /generatorId: '([^']+)',\s*taskNumber: ([56]),\s*seed: '([^']+)'/gu,
      ),
    ).at(-1);
    if (!match?.[1] || !match[2] || !match[3])
      throw new Error('Нет источника последнего вопроса.');
    const source = {
      generatorId: match[1],
      taskNumber: Number(match[2]) as 5 | 6,
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
  ['Исполнитель', 'FixedExecutor'],
  ['Трассировщик', 'ProgramTracer'],
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
  for (const name of ['FixedExecutor', 'ProgramTracer']) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  for (const lesson of programLessons)
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
      const code = scene.locator('.program-code-frame');
      if (await code.count()) {
        await code.focus();
        await expect(code).toBeFocused();
        if (
          await code.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          )
        ) {
          await code.press('ArrowRight');
          await expect
            .poll(() => code.evaluate((element) => element.scrollLeft))
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
  for (const lesson of programLessons) {
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

test('production scene screenshots at mobile and desktop widths', async ({
  page,
}, info) => {
  await mkdir('.cache/t7-7-screens', { recursive: true });
  for (const [route, id] of [
    ['materials/i5/executor-reverse/', 'fixed-executor'],
    ['materials/i6/program-conditions/', 'program-tracer'],
  ]) {
    if (!route || !id) throw new Error('Нет сцены.');
    const scene = await openScene(page, route, id);
    await scene.screenshot({
      path: `.cache/t7-7-screens/${id}-${info.project.name}.png`,
    });
  }
});
