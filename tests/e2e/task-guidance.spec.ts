import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generators } from '../../src/core/generators';
import {
  streamSources,
  resolveStreamTask,
} from '../../src/core/stream/catalog';
import { checkTaskAnswer } from '../../src/core/checker';
import { guidanceExample } from '../fixtures/guidance-example';

const gallery = 'http://127.0.0.1:4324/test-oge-app/dev/tasks/';
const seed = 'card-test';
async function open(page: Page, id: string) {
  await page.goto(gallery);
  await page.getByLabel('Источник задания').selectOption(id);
}
async function activate(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await button.focus();
  await button.press('Enter');
}
async function hints(page: Page) {
  const section = page.getByRole('region', { name: 'Помощь с заданием' });
  for (let index = 0; index < 3; index += 1) {
    await activate(page, `Открыть подсказку ${String(index + 1)} из 3`);
    const rows = section.locator('[id$="-hints"] li');
    await expect(rows).toHaveCount(index + 1);
    await expect(rows.last()).toBeFocused();
  }
  await expect(
    page.getByRole('button', { name: 'Все подсказки открыты' }),
  ).toBeDisabled();
}
async function solution(page: Page, count = 3) {
  const section = page.getByRole('region', { name: 'Помощь с заданием' });
  for (let index = 0; index < count; index += 1) {
    await activate(
      page,
      index === 0 ? 'Показать решение по шагам' : 'Следующий шаг решения',
    );
    const rows = section.locator('[id$="-solution"] li');
    await expect(rows).toHaveCount(index + 1);
    await expect(rows.last()).toBeFocused();
  }
  await expect(
    page.getByRole('button', { name: 'Решение открыто полностью' }),
  ).toBeDisabled();
}
test('guidance: keyboard reveals hints and steps in order without submitting or clearing drafts', async ({
  page,
}) => {
  await open(page, 'guidance-contract');
  const section = page.getByRole('region', { name: 'Помощь с заданием' });
  await expect(section.locator('.task-reveal')).toHaveCount(0);
  await expect(section.locator('math, pre, table')).toHaveCount(0);
  await page.getByLabel('Твой ответ', { exact: true }).fill('32');
  await page.getByLabel('Как я решал').fill('Проверю единицы измерения');
  await hints(page);
  await expect(section.locator('[id$="-solution"] li')).toHaveCount(0);
  await solution(page);
  await expect(section.locator('math')).toHaveCount(2);
  await expect(section.locator('table')).toBeVisible();
  await expect(section.locator('pre code')).toHaveText(
    guidanceExample().solution[2]?.code ?? '',
  );
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    '32',
  );
  await expect(page.getByLabel('Как я решал')).toHaveValue(
    'Проверю единицы измерения',
  );
  await expect(page.getByLabel('События карточки')).toHaveText('[]');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Seed', { exact: true }).fill('another-attempt');
  await expect(section.locator('.task-reveal')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Открыть подсказку 1 из 3' }),
  ).toBeEnabled();
});
for (const type of ['integer', 'word', 'sequence'] as const) {
  test(`guidance: normalized ${type} mistake gets its own explanation once`, async ({
    page,
  }) => {
    const cases = generators.flatMap((generator) => {
      const task = generator.generate(seed);
      if (task.answer.type !== type) return [];
      return task.commonMistakes.flatMap((mistake) => {
        const result = checkTaskAnswer(task, mistake.answer);
        return result.verdict === 'incorrect' && result.explanation
          ? [{ task, mistake }]
          : [];
      });
    });
    const item = cases[0];
    if (!item) throw new Error('Нет типичной ошибки.');
    await open(page, item.task.generatorId);
    const raw =
      type === 'integer'
        ? ` ${BigInt(item.mistake.answer) >= 0n ? '+' : ''}${item.mistake.answer} `
        : type === 'sequence'
          ? Array.from(item.mistake.answer).join(' ')
          : item.mistake.answer.toUpperCase();
    await page.getByLabel('Твой ответ', { exact: true }).fill(raw);
    await activate(page, 'Проверить ответ');
    await expect(page.locator('.task-mistake')).toHaveText(
      item.mistake.explanation,
    );
    await expect(page.getByLabel('События карточки')).toHaveText(
      '[{"kind":"automatic","correct":false}]',
    );
    await hints(page);
    await expect(page.getByLabel('События карточки')).toHaveText(
      '[{"kind":"automatic","correct":false}]',
    );
  });
}
test('guidance: format errors and unknown wrong answers do not invent a diagnosis', async ({
  page,
}) => {
  await open(page, 'guidance-contract');
  await page.getByLabel('Твой ответ', { exact: true }).fill('64 бит');
  await activate(page, 'Проверить ответ');
  await expect(page.locator('.task-feedback')).toContainText(
    'Попытка не засчитана',
  );
  await expect(page.locator('.task-mistake')).toHaveCount(0);
  await expect(page.getByLabel('События карточки')).toHaveText('[]');
  await page.getByLabel('Твой ответ', { exact: true }).fill('999');
  await activate(page, 'Проверить ответ');
  await expect(page.locator('.task-feedback')).toContainText('Пока неверно');
  await expect(page.locator('.task-mistake')).toHaveCount(0);
});
for (const selection of ['13.1', '13.2', '14', '15', '16']) {
  test(`guidance: №${selection} exposes real hints and solution without assigning a score`, async ({
    page,
  }) => {
    const source = streamSources().find(
      (entry) =>
        entry.taskNumber === Number(selection.split('.')[0]) &&
        (entry.kind !== 'curated' ||
          entry.variant13 ===
            (selection === '13.2' ? 'document' : 'presentation')),
    );
    if (!source) throw new Error('Нет источника.');
    const task = resolveStreamTask({
      generatorId: source.generatorId,
      taskNumber: source.taskNumber,
      seed: source.kind === 'curated' ? (source.seeds[0] ?? '') : seed,
    });
    await open(page, source.generatorId);
    await hints(page);
    await solution(page, task.solution.length);
    await expect(page.getByLabel('События карточки')).toHaveText('[]');
    await expect(page.getByRole('radio').first()).not.toBeChecked();
    const section = page.getByRole('region', { name: 'Помощь с заданием' });
    const details = section.locator('details');
    await details.getByText('Типичные ошибки', { exact: true }).click();
    for (const mistake of task.commonMistakes)
      await expect(details).toContainText(mistake.explanation);
    if (selection === '15' || selection === '16') {
      const code = task.solution.find((step) => step.code !== undefined)?.code;
      if (!code) throw new Error('Нет кода решения.');
      await expect(section.locator('pre code')).toHaveText(code);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
test('guidance: code copy is literal, hostile strings are inert, mobile and reduced motion work', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          document.documentElement.dataset.guidanceCopied = text;
          return Promise.resolve();
        },
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'guidance-contract');
  await hints(page);
  await solution(page);
  const section = page.getByRole('region', { name: 'Помощь с заданием' });
  await expect(section.locator('script,img,svg,iframe,a,style')).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, 'guidanceAttack') as unknown),
  ).toBeUndefined();
  await section
    .getByRole('button', { name: 'Скопировать код', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-guidance-copied',
    guidanceExample().solution[2]?.code ?? '',
  );
  expect(
    await section
      .locator('.task-reveal')
      .last()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Seed', { exact: true }).fill('animation-enabled');
  await activate(page, 'Открыть подсказку 1 из 3');
  expect(
    await section
      .locator('.task-reveal')
      .last()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('task-guidance-reveal');
  await page.evaluate(() => {
    document.documentElement.dataset.animations = 'off';
  });
  await activate(page, 'Открыть подсказку 2 из 3');
  expect(
    await section
      .locator('.task-reveal')
      .last()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('guidance: failed formatter loading leaves answer, draft and stream position intact', async ({
  page,
}) => {
  await page.goto('stream/');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  await page.getByLabel('Твой ответ', { exact: true }).fill('32');
  await page.getByLabel('Как я решал').fill('Не терять черновик');
  await page.route('**/_astro/*.js', (route) => route.abort());
  await activate(page, 'Открыть подсказку 1 из 3');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось открыть помощь',
  );
  await expect(page.locator('.task-guidance .task-reveal')).toHaveCount(0);
  await expect(page.getByLabel('Твой ответ', { exact: true })).toHaveValue(
    '32',
  );
  await expect(page.getByLabel('Как я решал')).toHaveValue(
    'Не терять черновик',
  );
  await expect(page.locator('.stream-position')).toHaveText('Задание 1');
  await expect(
    page.getByRole('button', { name: 'Открыть подсказку 1 из 3' }),
  ).toBeEnabled();
});
test('guidance: delayed help cannot appear on a different task', async ({
  page,
}) => {
  await page.goto('stream/');
  await expect(page.getByLabel('Что решать')).toBeEnabled();
  const gate = Promise.withResolvers<undefined>();
  const requested = Promise.withResolvers<undefined>();
  const handled = Promise.withResolvers<undefined>();
  await page.route('**/task-guidance.*.js', async (route) => {
    requested.resolve(undefined);
    await gate.promise;
    await route.continue();
    handled.resolve(undefined);
  });
  try {
    await activate(page, 'Открыть подсказку 1 из 3');
    await requested.promise;
    await page.getByLabel('Что решать').selectOption('13.2');
    await expect(
      page.getByRole('heading', {
        name: 'Задание №13.2 — документ',
        exact: true,
      }),
    ).toBeVisible();
    gate.resolve(undefined);
    await handled.promise;
    await page.unroute('**/task-guidance.*.js');
    await expect(page.locator('.task-guidance .task-reveal')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Открыть подсказку 1 из 3' }),
    ).toBeEnabled();
  } finally {
    gate.resolve(undefined);
  }
});

test('guidance: public Python solution respects CSP and preserves code, notes and score', async ({
  page,
}) => {
  const generator = generators.find((entry) => entry.taskNumber === 16);
  if (!generator) throw new Error('Нет Python-задания.');
  const task = generator.generate('public-guidance');
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
  await page.goto(
    `stream/?${new URLSearchParams({ task: task.generatorId, seed: task.seed })}`,
  );
  await expect(page.getByLabel('Код Python', { exact: true })).toBeVisible();
  await page.getByLabel('Код Python', { exact: true }).fill('print(42)');
  await page.getByLabel('Как я решал').fill('Мой план решения');
  await hints(page);
  await solution(page, task.solution.length);
  await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
    'print(42)',
  );
  await expect(page.getByLabel('Как я решал')).toHaveValue('Мой план решения');
  await expect(page.getByRole('radio').first()).not.toBeChecked();
  await expect(page.locator('.stream-position')).toHaveText('Задание 1');
  await expect(
    page.getByRole('button', { name: 'Пропустить задание', exact: true }),
  ).toBeEnabled();
  // Sample the reveal animation deliberately, including after its natural end.
  // A fade can pass at rest while making text unreadable during the reveal.
  const opacity = await page
    .locator('.task-guidance .task-reveal')
    .evaluateAll((items) =>
      items.map((item) => {
        for (const animation of item.getAnimations()) {
          const duration = animation.effect?.getComputedTiming().duration;
          if (typeof duration === 'number') {
            animation.pause();
            animation.currentTime = duration / 2;
          }
        }
        return getComputedStyle(item).opacity;
      }),
    );
  expect(opacity.every((value) => value === '1')).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
