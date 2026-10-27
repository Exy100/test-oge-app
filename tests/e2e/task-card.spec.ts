import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { generators } from '../../src/core/generators';
import { pythonGenerators } from '../../src/core/generators/16/programs';
import {
  streamSources,
  resolveStreamTask,
} from '../../src/core/stream/catalog';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { robotKinds } from '../../src/core/generators/15/fields';
import { referenceProgram } from '../../src/core/generators/15/robots';
import { shortFixtures } from '../fixtures/exam/short-answers';
import {
  programKinds,
  programCases,
  programParameters,
} from '../../src/core/generators/16/problems';

const gallery = 'http://127.0.0.1:4324/test-oge-app/dev/tasks/';
const seed = 'card-test';
async function open(page: Page, id: string) {
  await page.goto(gallery);
  await page.getByLabel('Источник задания').selectOption(id);
}
async function keyActivate(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await button.focus();
  await button.press('Enter');
}
for (const fixture of shortFixtures) {
  test(`card: ${fixture.id}, published blank answer is accepted`, async ({
    page,
  }) => {
    for (const answer of fixture.answers) {
      await open(page, `fixture:${fixture.id}`);
      await page.getByLabel('Твой ответ', { exact: true }).fill(answer);
      await page.getByLabel('Твой ответ', { exact: true }).press('Enter');
      await expect(page.getByLabel('События карточки')).toHaveText(
        '[{"kind":"automatic","correct":true}]',
      );
    }
  });
}
test('card: directed paths show the actual accessible task diagram', async ({
  page,
}) => {
  const generator = generators.find(
    (item) => item.generate(seed).figure?.kind === 'directed-graph',
  );
  if (!generator) throw new Error('Нет задачи со схемой.');
  await open(page, generator.id);
  await expect(
    page.getByRole('region', { name: 'Схема задания' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
for (const type of ['integer', 'word', 'sequence'] as const) {
  test(`card: ${type}, format errors do not count, keyboard submits once`, async ({
    page,
  }) => {
    const generator = generators.find(
      (item) => item.generate(seed).answer.type === type,
    );
    if (!generator) throw new Error('Нет формата для проверки.');
    const task = generator.generate(seed);
    if (task.answer.type === 'artifact')
      throw new Error('Нужен краткий ответ.');
    await open(page, generator.id);
    const input = page.getByLabel('Твой ответ', { exact: true });
    const events = page.getByLabel('События карточки');
    await input.focus();
    await input.press('Enter');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(events).toHaveText('[]');
    await expect(page.locator('.task-feedback')).toContainText(
      'Попытка не засчитана',
    );
    if (type !== 'word') {
      await input.fill(type === 'integer' ? '1.5 кг' : 'А,B,1');
      await input.press('Enter');
      await expect(events).toHaveText('[]');
    }
    const answer =
      type === 'sequence'
        ? Array.from(task.answer.value).join(' ')
        : `  ${task.answer.value}  `;
    await input.fill(answer);
    await input.press('Enter');
    await expect(events).toHaveText('[{"kind":"automatic","correct":true}]');
    await input.press('Enter');
    await expect(events).toHaveText('[{"kind":"automatic","correct":true}]');
    await expect(input).toHaveAttribute('readonly', '');
    await expect(
      page.getByRole('button', { name: 'Проверить ответ', exact: true }),
    ).toBeDisabled();
    if (type === 'sequence')
      await expect(page.locator('.task-feedback')).toContainText(
        'Пробелы между символами не учитывались',
      );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
test('card: wrong answer counts once, changing task clears answer and notes', async ({
  page,
}) => {
  const generator = generators.find(
    (item) => item.generate(seed).answer.type === 'integer',
  );
  if (!generator) throw new Error('Нет генератора.');
  const task = generator.generate(seed);
  if (task.answer.type !== 'integer') throw new Error('Нужен целый ответ.');
  await open(page, generator.id);
  await page.getByLabel('Как я решал').fill('Черновик');
  await page
    .getByLabel('Твой ответ', { exact: true })
    .fill(String(BigInt(task.answer.value) + 1n));
  await keyActivate(page, 'Проверить ответ');
  await expect(page.getByLabel('События карточки')).toHaveText(
    '[{"kind":"automatic","correct":false}]',
  );
  await page.getByLabel('Seed', { exact: true }).fill('next-task');
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Как я решал')).toHaveValue('');
  await expect(page.getByLabel('События карточки')).toHaveText('[]');
});

for (const selection of ['11', '12', '13.1', '13.2', '14', '15', '16']) {
  test(`card: №${selection} exact ZIP and keyboard criteria`, async ({
    page,
  }) => {
    const source = streamSources().find(
      (item) =>
        item.taskNumber === Number(selection.split('.')[0]) &&
        (item.kind !== 'curated' ||
          item.variant13 ===
            (selection === '13.2' ? 'document' : 'presentation')),
    );
    if (!source) throw new Error('Нет файлового задания.');
    const task = resolveStreamTask({
      generatorId: source.generatorId,
      taskNumber: source.taskNumber,
      seed: source.kind === 'curated' ? (source.seeds[0] ?? '') : seed,
    });
    await open(page, source.generatorId);
    await keyActivate(page, 'Подготовить файлы');
    const link = page.getByRole('link', { name: 'Скачать ZIP', exact: true });
    await expect(link).toBeVisible();
    const download = page.waitForEvent('download');
    await link.focus();
    await link.press('Enter');
    const path = await (await download).path();
    if (!path) throw new Error('Нет скачанного файла.');
    const expected = await createTaskDataset(task);
    expect(
      Buffer.from(await readFile(path)).equals(Buffer.from(expected.archive)),
    ).toBe(true);
    if (task.criteria) {
      const last = page.getByRole('radio').last();
      await last.focus();
      await last.press('Space');
      await keyActivate(page, 'Сохранить самооценку');
      await expect(page.getByLabel('События карточки')).toHaveText(
        JSON.stringify([
          {
            kind: 'practice',
            source: 'self',
            score: task.criteria.levels.at(-1)?.score,
          },
        ]),
      );
      await expect(
        page.getByRole('button', { name: 'Оставить без оценки' }),
      ).toBeDisabled();
    } else
      await expect(
        page.getByLabel('Твой ответ', { exact: true }),
      ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
test('card: choosing no assessment does not submit the selected score', async ({
  page,
}) => {
  const source = streamSources().find((item) => item.taskNumber === 14);
  if (!source) throw new Error('Нет №14.');
  await open(page, source.generatorId);
  await page.getByRole('radio').last().check();
  await keyActivate(page, 'Оставить без оценки');
  await expect(page.getByLabel('События карточки')).toHaveText(
    '[{"kind":"practice","score":null}]',
  );
  await expect(
    page.getByRole('status', { name: 'Результат самооценки' }),
  ).toHaveText('Работа оставлена без оценки. Точность не изменена.');
});
for (const kind of robotKinds) {
  test(`card: ${kind}, syntax error, step, run, reset and another field`, async ({
    page,
  }) => {
    await open(page, generators.find((g) => g.subtype === kind)?.id ?? '');
    const editor = page.getByLabel('Программа Робота', { exact: true });
    await editor.fill('лететь');
    await keyActivate(page, 'Запустить');
    await expect(page.getByRole('alert')).toContainText('Строка 1');
    await editor.fill(referenceProgram(kind));
    await editor.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Скачать свой код' }),
    ).toBeFocused();
    await keyActivate(page, 'Шаг');
    const status = page.getByRole('status', { name: 'Выполнение Робота' });
    await expect(status).toContainText('Шагов: 1.');
    await keyActivate(page, 'Запустить');
    await expect(status).toContainText('Все нужные клетки закрашены.', {
      timeout: 15000,
    });
    await expect(page.getByLabel('События карточки')).toHaveText('[]');
    await keyActivate(page, 'Сбросить выполнение');
    await expect(editor).toHaveValue(referenceProgram(kind));
    await page.getByLabel('Поле Робота', { exact: true }).selectOption('1');
    await expect(status).toHaveText('Готов к запуску.');
    await keyActivate(page, 'Запустить');
    await expect(status).toContainText('Все нужные клетки закрашены.', {
      timeout: 15000,
    });
  });
}
test('card: Robot pause/resume, crash and clearing running task', async ({
  page,
}) => {
  await open(page, 'robot-corridor-v2');
  const editor = page.getByLabel('Программа Робота', { exact: true });
  await editor.fill('нц 10000 раз\nзакрасить\nкц');
  await keyActivate(page, 'Запустить');
  await expect(editor).toBeDisabled();
  await keyActivate(page, 'Пауза');
  await expect(editor).toBeEnabled();
  const status = page.getByRole('status', { name: 'Выполнение Робота' });
  const before = await status.textContent();
  await page.waitForTimeout(160);
  await expect(status).toHaveText(before ?? '');
  await keyActivate(page, 'Запустить');
  await expect(editor).toBeDisabled();
  await keyActivate(page, 'Сбросить выполнение');
  await editor.fill('нц 30 раз\nвправо\nкц');
  await keyActivate(page, 'Запустить');
  await expect(status).toContainText('Робот столкнулся со стеной.');
  await editor.fill('нц 10000 раз\nзакрасить\nкц');
  await keyActivate(page, 'Запустить');
  await page
    .getByLabel('Источник задания')
    .selectOption(generators.find((g) => g.taskNumber === 1)?.id ?? '');
  await expect(page.getByLabel('Твой ответ', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Тренажёр Робота' }),
  ).toHaveCount(0);
});
for (const kind of programKinds) {
  test(`card: ${kind}, keyboard editor, exact code export and computed examples`, async ({
    page,
  }) => {
    const generator = pythonGenerators.find((g) => g.subtype === kind);
    if (!generator) throw new Error('Нет генератора Python.');
    await open(page, generator.id);
    const editor = page.getByLabel('Код Python', { exact: true });
    const code = 'n = int(input())\nprint(n)\n';
    await editor.fill(code);
    await editor.press('Tab');
    const link = page.getByRole('button', { name: 'Скачать свой код' });
    await expect(link).toBeFocused();
    const downloading = page.waitForEvent('download');
    await link.press('Enter');
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('answer.py');
    const path = await download.path();
    if (!path) throw new Error('Нет кода.');
    expect(await readFile(path, 'utf8')).toBe(code);
    const cases = programCases(programParameters(kind, seed), seed);
    for (const index of [0, cases.length - 1]) {
      await page
        .getByLabel('Пример ввода и вывода')
        .selectOption(String(index));
      expect(
        await page.locator('.program-example pre').nth(0).textContent(),
      ).toBe(cases[index]?.input);
      expect(
        await page.locator('.program-example pre').nth(1).textContent(),
      ).toBe(cases[index]?.output);
    }
    await expect(page.getByLabel('События карточки')).toHaveText('[]');
    await expect(
      page.getByRole('button', { name: 'Запустить', exact: true }),
    ).toHaveCount(0);
  });
}
test('public stream: first task is readable before JavaScript, controls wait for hydration', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(
      'https://127.0.0.1:4322/test-oge-app/stream/',
    );
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: /Задание №/ }),
    ).toBeVisible();
    await expect(page.locator('.task-card .rich-text')).not.toBeEmpty();
    await expect(page.getByLabel('Твой ответ', { exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Проверить ответ', exact: true }),
    ).toBeDisabled();
  } finally {
    await context.close();
  }
});
test('public stream: failed history write preserves the current answer and draft', async ({
  page,
}) => {
  await page.goto('stream/');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  const input = page.getByLabel('Твой ответ', { exact: true });
  await input.fill('32');
  await page.getByLabel('Как я решал').fill('Мой черновик');
  const statement = await page.locator('.task-card .rich-text').textContent();
  const beforeUrl = page.url();
  await page.evaluate(() => {
    window.history.replaceState = () => {
      throw new DOMException('History unavailable', 'SecurityError');
    };
  });
  await keyActivate(page, 'Пропустить задание');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось подготовить задание',
  );
  await expect(input).toHaveValue('32');
  await expect(page.getByLabel('Как я решал')).toHaveValue('Мой черновик');
  await expect(page.locator('.task-card .rich-text')).toHaveText(
    statement ?? '',
  );
  await expect(page.locator('.stream-position')).toHaveText('Задание 1');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  expect(page.url()).toBe(beforeUrl);
});
test('public stream: production CSP, all numbers, next-task focus, themes and mobile layout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /content.security.policy|violat.*(?:policy|directive)/iu.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  await page.goto('./');
  await page.getByRole('link', { name: 'Начать тренировку' }).click();
  await expect(page).toHaveURL(/\/test-oge-app\/stream\/$/u);
  await expect(
    page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Практика', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Что решать')).toHaveValue('short');
  for (const number of [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13.1',
    '13.2',
    '14',
    '15',
    '16',
  ]) {
    await page.getByLabel('Что решать').selectOption(number);
    if (Number(number) <= 12)
      await expect(
        page.getByLabel('Твой ответ', { exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole('heading', { name: 'Оцени свою работу', exact: true }),
      ).toBeVisible();
  }
  await page.getByLabel('Что решать').selectOption('1');
  await page.getByLabel('Твой ответ', { exact: true }).fill('');
  await keyActivate(page, 'Проверить ответ');
  await expect(page.locator('.task-feedback')).toContainText(
    'Попытка не засчитана',
  );
  await expect(
    page.getByRole('button', { name: 'Пропустить задание' }),
  ).toBeEnabled();
  await page.getByLabel('Твой ответ', { exact: true }).fill('0');
  await keyActivate(page, 'Проверить ответ');
  await keyActivate(page, 'Следующее задание');
  await expect(page.locator('.stream-position')).toBeFocused();
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue('');
  await page.getByLabel('Что решать').selectOption('13.2');
  await expect(
    page.getByRole('heading', {
      name: 'Задание №13.2 — документ',
      exact: true,
    }),
  ).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Что решать').selectOption('16');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel('Код Python', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('card: editor and dataset object URLs are released on task change', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = create(blob);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      active.delete(url);
      revoke(url);
    };
    Object.defineProperty(window, 'taskBlobCount', { get: () => active.size });
  });
  await open(page, 'robot-corridor-v2');
  const count = () =>
    page.evaluate(() => Reflect.get(window, 'taskBlobCount') as number);
  await expect.poll(count).toBe(0);
  await page.getByLabel('Программа Робота', { exact: true }).fill('закрасить');
  await expect.poll(count).toBe(0);
  const downloaded = page.waitForEvent('download');
  await keyActivate(page, 'Скачать свой код');
  const code = await downloaded;
  expect(code.suggestedFilename()).toBe('answer.txt');
  const savedCode = await code.path();
  if (!savedCode) throw new Error('Нет файла программы Робота.');
  expect(await readFile(savedCode, 'utf8')).toBe('закрасить');
  await expect.poll(count).toBe(1);
  await keyActivate(page, 'Подготовить файлы');
  await expect(
    page.getByRole('link', { name: 'Скачать ZIP', exact: true }),
  ).toBeVisible();
  await expect.poll(count).toBe(3);
  await page
    .getByLabel('Источник задания')
    .selectOption(generators.find((g) => g.taskNumber === 1)?.id ?? '');
  await expect.poll(count).toBe(0);
  await expect(
    page.getByRole('link', { name: 'Скачать ZIP', exact: true }),
  ).toHaveCount(0);
});
