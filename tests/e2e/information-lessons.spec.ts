import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preparationLessons } from '../../src/lib/lessons/preparation';
import { lessonTask } from '../../src/lib/lessons/content';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import { installInteractiveAudit } from '../fixtures/interactive-audit';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const informationLessons = preparationLessons.filter((lesson) =>
  ['i1', 'i2'].includes(lesson.section),
);

async function openScene(page: Page, route: string, id: string) {
  await page.goto(route);
  const scene = page.locator('#' + id);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  return scene;
}

test('course scene loads only after scrolling; manual completion reaches the real catalog', async ({
  page,
}) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/(?:BitsAndBytes|TextVolume|CodeDecoder)\.[^/]+\.js/u.test(
        request.url(),
      )
    )
      sceneRequests.push(request.url());
  });
  await page.goto('materials/i1/bits-bytes/');
  const completed = page.getByRole('button', {
    name: 'Урок пройден',
    exact: true,
  });
  await expect(completed).toBeEnabled();
  expect(sceneRequests).toHaveLength(0);
  const scene = page.locator('#bits-and-bytes');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.information-lab')).toBeVisible();
  expect(sceneRequests).toHaveLength(1);
  expect(sceneRequests[0]).toContain('/BitsAndBytes.');
  await completed.click();
  await page.goto('materials/?numbers=1');
  await expect(page.locator('.materials-completed')).toContainText('1 из 3');
  await page
    .getByRole('link', {
      name: 'Биты и байты: измеряем информацию',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Урок пройден', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const lesson of informationLessons) {
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
    await example.locator('summary').focus();
    await example.locator('summary').press('Enter');
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
    // Last question is an exam-format generator, solved by the separate fixture oracle.
    const source = {
      generatorId:
        lesson.taskNumber === 1 ? 'removed-word-v2' : 'decode-repeated-v2',
      taskNumber: lesson.taskNumber as 1 | 2,
      seed: lesson.id + '-quiz-5',
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
    await expect(
      page.getByRole('link', { name: 'Перейти к заданиям' }),
    ).toHaveAttribute(
      'href',
      `/test-oge-app/stream/?numbers=${String(lesson.taskNumber)}`,
    );
    expect(errors).toEqual([]);
  });
}

test('text edits include spaces, separators, insertion, zero length and correct byte units', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i1/changing-text/',
    'text-volume',
  );
  const remove = scene.getByRole('button', {
    name: 'Удалить слово вместе с разделителем',
  });
  await remove.focus();
  await remove.press('Enter');
  const before = await scene.getByLabel('Текст до изменения').inputValue();
  const after = await scene.getByLabel('Текст после изменения').inputValue();
  const bytes = (before.length - after.length) * 2;
  await expect(scene).toContainText(
    `Объём уменьшился на ${String(bytes)} байт.`,
  );
  const answer = scene.getByLabel('На сколько байт изменился объём?');
  await answer.fill('999');
  await answer.press('Enter');
  await expect(scene).toContainText('Проверь разность длин');
  await answer.fill(String(bytes));
  await answer.press('Enter');
  await expect(scene).toContainText('Верно. Разность числа знаков');
  await scene.getByLabel('Текст после изменения').fill(before + '!');
  await expect(scene).toContainText('Объём увеличился на 2 байта.');
  await scene.getByLabel('Текст до изменения').fill('');
  await scene.getByLabel('Текст после изменения').fill('');
  await expect(scene).toContainText('Объём не изменился.');
  await scene.getByLabel('Текст после изменения').fill('🙂');
  await expect(scene.getByRole('alert')).toContainText('До 160 знаков');
});

test('alphabet capacity and byte remainder work with keyboard, pause and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await openScene(
    page,
    'materials/i1/bits-bytes/',
    'bits-and-bytes',
  );
  await expect(scene).toContainText('Кодов не хватает');
  const width = scene.getByLabel('Длина кода одной буквы');
  await width.focus();
  await width.press('ArrowDown');
  await width.press('Enter');
  const check = scene.getByRole('button', {
    name: 'Проверить минимальную длину',
  });
  await check.focus();
  await check.press('Space');
  await expect(scene).toContainText('5 бит — наименьшая достаточная длина');
  await expect(scene.locator('.binary-codes li')).toHaveCount(32);
  await scene.getByLabel('Всего бит (0–1024)').fill('19');
  await expect(scene).toContainText('Полных байтов: 2; осталось бит: 3');
  await expect(scene.locator('.interactive-host')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await scene.getByLabel('Всего бит (0–1024)').fill('8');
  await expect(scene).toContainText('Полных байтов: 1; осталось бит: 0');
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await scene.scrollIntoViewIfNeeded();
  await expect(width).toHaveValue('5');
});

test('nonprefix decoder explores dead ends and accepts every full parse including symbolic codes', async ({
  page,
}) => {
  const scene = await openScene(
    page,
    'materials/i2/unique-decoding/',
    'code-decoder',
  );
  const check = scene.getByRole('button', { name: 'Проверить разбор' });
  const letter = (value: string) =>
    scene.getByRole('button', { name: new RegExp(`^Добавить ${value} `, 'u') });
  await letter('Б').focus();
  await letter('Б').press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Разбор ещё не завершён');
  await scene.getByRole('button', { name: 'Шаг назад' }).press('Enter');
  await letter('А').press('Enter');
  await letter('В').press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Это единственная расшифровка');
  const preset = scene.getByLabel('Учебная таблица');
  await preset.focus();
  await preset.press('ArrowDown');
  await preset.press('Enter');
  await letter('А').press('Enter');
  await letter('В').press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Число полных расшифровок: 2');
  await scene.getByRole('button', { name: 'Все расшифровки' }).press('Enter');
  await expect(scene).toContainText('БА → 010');
  await scene
    .getByRole('button', { name: 'Сначала', exact: true })
    .press('Enter');
  await letter('Б').press('Enter');
  await letter('А').press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Верно: сообщение прочитано целиком');
  await preset.focus();
  await preset.press('End');
  await preset.press('Enter');
  await expect(scene.getByLabel('Сигнал', { exact: true })).toHaveValue('.--');
  await letter('А').press('Enter');
  await letter('В').press('Enter');
  await check.press('Enter');
  await expect(scene).toContainText('Это единственная расшифровка');
  await scene.getByLabel('Код буквы Б').fill('.');
  await expect(scene.getByRole('alert')).toContainText('не должны повторяться');
});

for (const [title, module] of [
  ['Объём текста', 'TextVolume'],
  ['Биты и байты', 'BitsAndBytes'],
  ['Декодер', 'CodeDecoder'],
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
  for (const name of ['TextVolume', 'BitsAndBytes', 'CodeDecoder']) {
    const file = files.find(
      (file) => file.startsWith(name + '.') && file.endsWith('.js'),
    );
    if (!file) throw new Error('Нет production-чанка ' + name);
    expect(await moduleBytes(file, new Set())).toBeLessThanOrEqual(80_000);
  }
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: all six lessons are accessible at 360 px without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.addInitScript((theme) => {
      localStorage.setItem(
        'oge:informatics:v1:settings',
        JSON.stringify({ version: 1, theme, fontSize: 100, animations: false }),
      );
    }, theme);
    for (const lesson of informationLessons) {
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
  for (const lesson of informationLessons) {
    await page.goto(`https://127.0.0.1:4322/test-oge-app${lesson.route}`);
    const alternatives = page.locator('.interactive-alternative');
    await expect(alternatives).toHaveCount(lesson.id === 'bits-bytes' ? 2 : 1);
    for (const alternative of await alternatives.all()) {
      await alternative.locator('summary').click();
      await expect(alternative.locator('div')).toBeVisible();
    }
    await page.locator('#example-1 summary').click();
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
