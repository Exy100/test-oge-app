import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { codingSources, codingArchiveHref } from '../../src/lib/lessons/coding';
import { referenceProgram } from '../../src/core/generators/15/robots';
import { readZip } from '../../src/core/datasets/zip';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { resolveStreamTask } from '../../src/core/stream/catalog';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
declare global {
  interface Window {
    codingIntervals: () => number;
  }
}
const lessons = preparationLessons.filter((item) =>
  ['i13', 'i14'].includes(item.section),
);
async function sceneFor(page: Page, route: string) {
  await page.goto(route);
  const scene = page.locator('#robot-lab, #program-tracer');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}
test('Robot accepts a general program, keyboard steps, all fields and exact downloaded code', async ({
  page,
}, info) => {
  const scene = await sceneFor(page, 'materials/i13/robot-commands/');
  const robot = scene.locator('.robot-practice'),
    code = referenceProgram('robot-corridor');
  for (const name of [
    'Запустить',
    'Пауза',
    'Шаг',
    'Скачать свой код',
    'Проверить семейство',
  ]) {
    const box = await robot
      .getByRole('button', { name, exact: true })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await robot.getByLabel('Программа Робота', { exact: true }).fill(code);
  await robot.getByRole('button', { name: 'Шаг', exact: true }).press('Enter');
  await expect(
    robot.getByRole('status', { name: 'Выполнение Робота' }),
  ).toContainText('Шагов: 1');
  await robot
    .getByRole('button', { name: 'Проверить семейство' })
    .press('Enter');
  await expect(robot).toContainText('Пройдено полей: 8 из 8');
  const download = page.waitForEvent('download');
  const save = robot.getByRole('button', { name: 'Скачать свой код' });
  if (info.project.use.hasTouch === true) await save.tap();
  else await save.click();
  const path = await (await download).path();
  if (!path) throw new Error('Нет скачанного кода.');
  expect(await readFile(path, 'utf8')).toBe(code);
  await robot.getByLabel('Поле Робота', { exact: true }).selectOption('1');
  await expect(
    robot.getByLabel('Программа Робота', { exact: true }),
  ).toHaveValue(code);
  await expect(
    robot.getByRole('status', { name: 'Выполнение Робота' }),
  ).toHaveText('Готов к запуску.');
  await robot.getByRole('button', { name: 'Шаг', exact: true }).click();
  await robot.getByRole('button', { name: 'Шаг', exact: true }).click();
  await expect(
    robot.getByRole('status', { name: 'Выполнение Робота' }),
  ).toContainText('Все нужные клетки закрашены');
});
test('Robot reports syntax, collision and finite-family failures, not an exam score', async ({
  page,
}) => {
  const scene = await sceneFor(page, 'materials/i13/robot-commands/'),
    robot = scene.locator('.robot-practice');
  await robot.getByLabel('Поле Робота', { exact: true }).selectOption('1');
  await robot.getByLabel('Программа Робота', { exact: true }).fill('вверх');
  await robot.getByRole('button', { name: 'Шаг', exact: true }).click();
  await expect(robot).toContainText('столкнулся со стеной');
  await robot
    .getByLabel('Программа Робота', { exact: true })
    .fill('если справа свободно то');
  await robot.getByRole('button', { name: 'Шаг', exact: true }).click();
  await expect(robot.getByRole('alert')).toContainText('Не закрыто условие');
  await robot.getByLabel('Программа Робота', { exact: true }).fill('закрасить');
  await robot.getByRole('button', { name: 'Проверить семейство' }).click();
  await expect(robot).toContainText('Конечный набор проверок не доказывает');
  await expect(robot).toContainText('Пройдено полей: 1 из 8.');
});
test('automatic Robot execution pauses with its host, offscreen and reduced motion; manual steps remain', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const browserWindow: Window = window;
    const timers = new Set<number>(),
      original = browserWindow.setInterval.bind(browserWindow),
      clear = browserWindow.clearInterval.bind(browserWindow);
    browserWindow.setInterval = (
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      const id = original(handler, timeout, ...args);
      timers.add(id);
      return id;
    };
    browserWindow.clearInterval = (id) => {
      if (id !== undefined) timers.delete(id);
      clear(id);
    };
    Object.defineProperty(window, 'codingIntervals', {
      value: () => timers.size,
    });
  });
  const scene = await sceneFor(page, 'materials/i13/robot-commands/'),
    robot = scene.locator('.robot-practice');
  await robot.getByLabel('Поле Робота', { exact: true }).selectOption('2');
  await robot
    .getByLabel('Программа Робота', { exact: true })
    .fill('нц пока справа свободно\nкц');
  await robot.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.codingIntervals()))
    .toBe(1);
  await scene
    .locator('.interactive-host > .interactive-toolbar')
    .getByRole('button', { name: 'Пауза', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.codingIntervals()))
    .toBe(0);
  await expect(robot).toContainText('Выполнение приостановлено');
  await scene
    .locator('.interactive-host > .interactive-toolbar')
    .getByRole('button', { name: 'Пауза', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.codingIntervals()))
    .toBe(1);
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.codingIntervals()))
    .toBe(0);
  await scene.scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => window.codingIntervals()))
    .toBe(0);
  await expect(
    robot.getByRole('button', { name: 'Запустить', exact: true }),
  ).toBeDisabled();
  await robot.getByRole('button', { name: 'Шаг', exact: true }).click();
  await expect(
    robot.getByRole('status', { name: 'Выполнение Робота' }),
  ).toContainText('Шагов:');
});
test('all confirmed Robot families solve their actual boundary fields', async ({
  page,
}) => {
  const scene = await sceneFor(page, 'materials/i13/robot-general/');
  for (const kind of [
    'robot-corner-right',
    'robot-corner-left',
    'robot-stairs',
  ] as const) {
    await scene
      .getByLabel('Семейство полей', { exact: true })
      .selectOption(kind);
    await scene
      .getByLabel('Программа Робота', { exact: true })
      .fill(referenceProgram(kind));
    await scene.getByRole('button', { name: 'Проверить семейство' }).click();
    await expect(scene).toContainText('Пройдено полей: 8 из 8');
  }
});
test('new sequence traces accept fractional means, newline-separated predictions, negative maxima and sentinel input', async ({
  page,
}) => {
  const scene = await sceneFor(page, 'materials/i14/python-aggregates/');
  await scene
    .getByLabel('Ввод: N и последовательность', { exact: true })
    .fill(' 2 \n +7\n10 \n');
  await scene.getByLabel('Какой будет вывод?', { exact: true }).fill('8.5\n2');
  await scene.getByRole('button', { name: 'Проверить прогноз' }).press('Enter');
  await expect(scene).toContainText('Верно: прогноз');
  await scene
    .getByRole('button', { name: 'Следующий шаг программы' })
    .press('Enter');
  await expect(
    scene.getByRole('region', { name: 'Переменные после текущего шага' }),
  ).toContainText('n');
  await scene
    .getByLabel('Ввод: N и последовательность', { exact: true })
    .fill('2 7 10');
  await expect(scene.getByRole('alert')).toContainText(
    'по одному целому числу на строке',
  );
  await expect(
    scene.getByRole('button', { name: 'Проверить прогноз' }),
  ).toHaveCount(0);
  await scene.getByLabel('Программа для трассировки').selectOption('pairs');
  await scene
    .getByLabel('Ввод: N и последовательность', { exact: true })
    .fill('3\n-3\n-3\n-6');
  await scene.getByLabel('Какой будет вывод?', { exact: true }).fill('2 -6');
  await scene.getByRole('button', { name: 'Проверить прогноз' }).click();
  await expect(scene).toContainText('Верно: прогноз');
  await scene.getByLabel('Программа для трассировки').selectOption('sentinel');
  await scene.getByLabel('Ввод до нуля', { exact: true }).fill('517\n0');
  await scene.getByLabel('Какой будет вывод?', { exact: true }).fill('1');
  await scene.getByRole('button', { name: 'Проверить прогноз' }).click();
  await expect(scene).toContainText('Верно: прогноз');
  await scene.getByLabel('Ввод до нуля', { exact: true }).fill('517');
  await expect(scene.getByRole('alert')).toContainText('завершающий 0');
  await expect(
    scene.getByRole('button', { name: 'Проверить прогноз' }),
  ).toHaveCount(0);
});
test('all eleven static code ZIP archives preserve exact generated code, fields, tests and manifests', async ({
  request,
}) => {
  expect(codingSources).toHaveLength(11);
  for (const source of codingSources) {
    const href = codingArchiveHref(source);
    if (!href) throw new Error('Нет источника.');
    const response = await request.get(href);
    expect(response.ok()).toBe(true);
    const actual = readZip(await response.body()),
      dataset = await createTaskDataset(resolveStreamTask(source));
    expect(actual.size).toBe(dataset.files.size);
    for (const [path, bytes] of dataset.files)
      expect(
        Buffer.from(actual.get(path) ?? []).equals(Buffer.from(bytes)),
      ).toBe(true);
  }
});

for (const lesson of lessons) {
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
    const exam = page.locator('#question-5');
    await exam.scrollIntoViewIfNeeded();
    await expect(
      exam.getByRole('button', { name: 'Проверить ответ' }),
    ).toBeEnabled();
    await exam.getByRole('radio').first().check();
    await exam.getByRole('button', { name: 'Проверить ответ' }).press('Enter');
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
    if (lesson.variant13)
      expect(new URL(href, page.url()).searchParams.get('variant13')).toBe(
        lesson.variant13,
      );
    expect(errors).toEqual([]);
  });
}

for (const [title, module] of [
  ['Поле Робота', 'RobotLab'],
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
      if (module === 'RobotLab' && cycle === 19) {
        await harness
          .getByLabel('Поле Робота', { exact: true })
          .selectOption('2');
        await harness
          .getByLabel('Программа Робота', { exact: true })
          .fill('нц пока справа свободно\nкц');
        await harness
          .getByRole('button', { name: 'Запустить', exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(() => window.interactiveResources().intervals),
          )
          .toBe(1);
      }
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
  for (const name of ['RobotLab', 'ProgramTracer']) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  for (const lesson of lessons)
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
      const trace = scene.getByText('Трасса последних команд', { exact: true });
      if (await trace.count()) await trace.click();
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
  for (const lesson of lessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternatives = page.locator('.interactive-alternative');
    await expect(alternatives).toHaveCount(lesson.id === 'robot-loops' ? 2 : 1);
    for (const alternative of await alternatives.all()) {
      await alternative.locator('summary').click();
      await expect(alternative.locator('div')).toBeVisible();
    }
    await page.locator('#example-1 [data-lesson-example] > summary').click();
    await expect(page.locator('#example-1 .lesson-steps > li')).toHaveCount(3);
    await expect(page.locator('#example-1 a[download]')).toBeVisible();
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

test('Robot and sequence screenshots retain legible mobile and desktop layouts', async ({
  page,
}, info) => {
  await mkdir('.cache/t7-11-screens', { recursive: true });
  for (const route of [
    'materials/i13/robot-general/',
    'materials/i14/python-aggregates/',
  ]) {
    const scene = await sceneFor(page, route);
    const id = route.split('/').at(-2);
    await scene.screenshot({
      path: `.cache/t7-11-screens/${String(id)}-${info.project.name}.png`,
    });
    await page
      .locator('#theory svg')
      .first()
      .screenshot({
        path: `.cache/t7-11-screens/${String(id)}-theory-${info.project.name}.png`,
      });
  }
});
