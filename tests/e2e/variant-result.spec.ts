import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import {
  buildFixedVariant,
  buildVariant,
  variantSeed,
} from '../../src/core/variants';
import {
  createExamDraft,
  type ExamAttempt,
} from '../../src/core/variants/exam';
import { PREFIX, areaSchemas } from '../../src/core/storage/schemas';
import type { Variant } from '../../src/core/types';

const variant = buildFixedVariant('V01', 'document');
const key = PREFIX + 'variantAttempts';
function attempt(
  total: number | null = null,
  source: Variant = variant,
): ExamAttempt {
  const choice = source.tasks.find((task) => task.taskNumber === 13)?.variant13;
  if (!choice) throw new Error('Нет выбора №13.');
  let remaining = total ?? 12;
  const draft = createExamDraft(
    {
      id: 'result + 🧩',
      variantId: source.id,
      seed: variantSeed(source),
      variant13: choice,
    },
    Date.parse('2026-10-21T10:00:00Z'),
  );
  const answers: ExamAttempt['answers'] = [];
  const assessments: ExamAttempt['assessments'] = [];
  for (const task of source.tasks) {
    if (task.answer.type !== 'artifact') {
      answers.push({
        taskNumber: task.taskNumber,
        text: remaining > 0 ? task.answer.value : '',
        reasoning: '',
      });
      remaining = Math.max(0, remaining - 1);
    } else {
      const score = Math.min(remaining, task.criteria?.max ?? 0);
      remaining -= score;
      if (total !== null)
        assessments.push({
          taskNumber: task.taskNumber as 13 | 14 | 15 | 16,
          score,
          source: 'self',
        });
      answers.push({
        taskNumber: task.taskNumber,
        text: task.taskNumber === 16 ? 'print(7)\n# моя запись' : 'my-work',
        reasoning: 'Черновик сохранён',
      });
    }
  }
  return {
    ...draft,
    elapsedMs: 1000,
    finishedAt: '2026-10-21T10:00:01Z',
    score: null,
    answers,
    assessments,
  };
}
async function seed(page: Page, entries: ExamAttempt[]) {
  await page.addInitScript(
    ({ key, entries }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify({ version: 1, entries }));
    },
    { key, entries },
  );
}
async function history(page: Page) {
  return areaSchemas.variantAttempts.parse(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
      key,
    ),
  );
}
function url(saved = attempt(), segment = 'V01') {
  return `variants/${segment}/result/?${new URLSearchParams({ attempt: saved.id })}`;
}
async function review(page: Page, number: number) {
  const details = page.locator(`#result-task-${String(number)}`);
  if ((await details.getAttribute('open')) === null)
    await details.locator(':scope > summary').click();
  await expect(
    details.getByRole('group', { name: 'Балл по критериям' }),
  ).toBeVisible();
  return details;
}

test('self-assessment completes the result, persists, exports, and distinguishes zero from unknown', async ({
  page,
}) => {
  const saved = attempt();
  await seed(page, [saved]);
  await page.goto(url(saved));
  const summary = page.locator('.result-screen .result-summary');
  await expect(summary).toContainText('Результат неполный: 12 учтено из 21');
  await expect(summary).toContainText('от 12 до 21');
  await expect(
    page.locator('.result-screen .result-table tbody tr'),
  ).toHaveCount(16);
  await page.getByRole('link', { name: 'Разбор №13', exact: true }).click();
  await expect(page.locator('#result-task-13 > summary')).toBeFocused();
  const thirteen = await review(page, 13);
  await thirteen.getByRole('radio', { name: /^0 балл/u }).check();
  await expect(summary).toContainText('от 12 до 19');
  for (const [number, score] of [
    [14, 3],
    [15, 2],
    [16, 2],
  ]) {
    const details = await review(page, number ?? 14);
    await details
      .getByRole('radio', { name: new RegExp(`^${String(score)} балл`, 'u') })
      .check();
  }
  await expect(summary).toContainText('Первичный балл: 19 из 21');
  await expect(summary).toContainText('Ориентировочная отметка: 5');
  await expect(summary).toContainText('2026');
  await expect(summary).toContainText(
    'применение шкалы к 2027 году не подтверждено',
  );
  const fourteen = page.locator('#result-task-14');
  await fourteen.getByRole('radio', { name: /^0 балл/u }).check();
  await expect(summary).toContainText('Первичный балл: 16 из 21');
  await expect(summary).toContainText('Ориентировочная отметка: 4');
  await fourteen.getByRole('button', { name: 'Снять оценку' }).click();
  await expect(summary).toContainText('Результат неполный: 16 учтено из 21');
  await expect(summary).toContainText('от 16 до 19');
  await page.reload();
  await expect(summary).toContainText('Результат неполный');
  const restored = await review(page, 14);
  await restored.getByRole('radio', { name: /^3 балл/u }).check();
  await expect(summary).toContainText('Первичный балл: 19 из 21');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать мои ответы' }).click();
  const path = await (await downloading).path();
  if (!path) throw new Error('Нет экспорта.');
  const exported = JSON.parse(await readFile(path, 'utf8')) as ExamAttempt;
  expect(exported.score).toBe(19);
  expect(exported.answers).toEqual(saved.answers);
  expect((await history(page)).entries[0]?.score).toBe(19);
});

for (const total of [0, 4, 5, 10, 11, 16, 17, 21]) {
  test(`grade boundary ${String(total)} is shown from actual answers`, async ({
    page,
  }) => {
    const saved = attempt(total);
    await seed(page, [saved]);
    await page.goto(url(saved));
    const summary = page.locator('.result-screen .result-summary');
    await expect(summary).toContainText(
      `Первичный балл: ${String(total)} из 21`,
    );
    await expect(summary).toContainText(
      `Ориентировочная отметка: ${String(total <= 4 ? 2 : total <= 10 ? 3 : total <= 16 ? 4 : 5)}`,
    );
    await expect
      .poll(async () => (await history(page)).entries[0]?.score)
      .toBe(total);
  });
}

test('history selects the exact fixed or random attempt and never guesses missing records', async ({
  page,
}) => {
  const random = buildVariant('Случайный + 🧩', 'presentation');
  const first = attempt(5);
  const second = { ...attempt(21), id: 'second' };
  const seeded = { ...attempt(17, random), id: 'random-result' };
  await seed(page, [first, second, seeded]);
  await page.goto('variants/');
  const links = page.locator('.variant-history-table tbody a');
  await links.nth(1).click();
  await expect(page).toHaveURL(/result\/\?attempt=second/u);
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '21 из 21',
  );
  await page.goto(url(seeded, 'random'));
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '17 из 21',
  );
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeVisible();
  for (const path of [
    'variants/V02/result/?attempt=second',
    'variants/V01/result/?attempt=absent',
    'variants/V01/result/?attempt=second&attempt=second',
    'variants/V01/result/',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('status')).toContainText('Попытка не найдена');
    await expect(page.locator('.variant-result')).toHaveCount(0);
  }
  expect((await history(page)).entries).toHaveLength(3);
});

test('other-tab self-assessments update live without changing an active draft or resurrecting deleted history', async ({
  page,
  context,
}) => {
  const saved = attempt(21);
  await seed(page, [saved]);
  await page.goto(url(saved));
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '21 из 21',
  );
  const draft = createExamDraft(
    {
      id: 'unfinished',
      variantId: saved.variantId,
      seed: saved.seed,
      variant13: saved.variant13,
    },
    0,
    'training',
  );
  await page.evaluate(
    ({ draft, key }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, current: draft }));
    },
    { draft, key: PREFIX + 'variantDraft' },
  );
  const other = await context.newPage();
  await other.goto(url(saved));
  const otherReview = await review(other, 14);
  await otherReview.getByRole('radio', { name: /^0 балл/u }).check();
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '18 из 21',
  );
  const ownReview = await review(page, 13);
  await ownReview.getByRole('radio', { name: /^0 балл/u }).check();
  await expect(other.locator('.result-screen .result-summary')).toContainText(
    '16 из 21',
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as unknown,
      PREFIX + 'variantDraft',
    ),
  ).toEqual({ version: 1, current: draft });
  await other.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, entries: [] }));
  }, key);
  await expect(page.getByRole('status')).toContainText('Попытка не найдена');
  expect((await history(page)).entries).toHaveLength(0);
  await other.close();
});

test('result supports keyboard and both themes at 200% with no accessibility violations', async ({
  page,
}) => {
  await seed(page, [attempt()]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url());
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeFocused();
  const details = await review(page, 14);
  const radio = details.getByRole('radio', { name: /^3 балл/u });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(details.getByRole('radio', { name: /^2 балл/u })).toBeChecked();
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  const link = page.getByRole('link', { name: /^№14:/u });
  await expect(link).toHaveAttribute('href', /numbers=14&variant13=document/u);
  await link.click();
  await expect(page.locator('.task-card')).toBeVisible();
});

test('print preparation includes every condition, answer, solution and rubric without opening screen details', async ({
  page,
}) => {
  await seed(page, [attempt(21)]);
  await page.goto(url());
  await page
    .getByRole('button', { name: 'Подготовить результат к печати' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Печатать результат' }),
  ).toBeVisible();
  await expect(page.locator('.result-print-task')).toHaveCount(16);
  await expect(page.locator('.result-screen details[open]')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.result-screen')).toBeHidden();
  await expect(page.locator('.result-print')).toBeVisible();
  await expect(page.locator('.result-print-task').last()).toContainText(
    'print(7)',
  );
  await expect(page.locator('.result-print-task')).toHaveCount(16);
  await expect(page.locator('.result-print .result-summary')).toContainText(
    '21 из 21',
  );
  await expect(page.locator('.result-print fieldset')).toHaveCount(4);
  await expect(
    page.locator('.result-print-task').last().locator('.rich-text-container'),
  ).toHaveCount((variant.tasks.at(-1)?.solution.length ?? 0) + 1);
});

test('a failed result download preserves history and can be retried', async ({
  page,
}) => {
  const saved = attempt();
  await seed(page, [saved]);
  await page.route('**/ExamFinished.*.js', (route) => route.abort());
  await page.goto(url(saved));
  await expect(page.getByRole('alert')).toContainText(
    'Ответы остаются в истории',
  );
  expect((await history(page)).entries[0]?.answers).toEqual(saved.answers);
  await page.unroute('**/ExamFinished.*.js');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён' }),
  ).toBeVisible();
});

test('a print module failure offers reload without losing the saved result', async ({
  page,
}) => {
  const saved = attempt(21);
  await seed(page, [saved]);
  await page.route('**/ResultPrint.*.js', (route) => route.abort());
  await page.goto(url(saved));
  await page
    .getByRole('button', { name: 'Подготовить результат к печати' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'ответы останутся в истории',
  );
  await page.unroute('**/ResultPrint.*.js');
  await page.getByRole('button', { name: 'Перезагрузить для печати' }).click();
  await page
    .getByRole('button', { name: 'Подготовить результат к печати' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Печатать результат' }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printed = 'true';
    };
  });
  await page.getByRole('button', { name: 'Печатать результат' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
  expect((await history(page)).entries[0]?.score).toBe(21);
});

test('blocked variant rebuilding keeps answers available and recovers after reload', async ({
  page,
}) => {
  const saved = attempt(21);
  await seed(page, [saved]);
  await page.route('**/result.worker-*.js', (route) => route.abort());
  await page.goto(url(saved));
  await expect(page.getByRole('alert')).toContainText(
    'сохранённые ответы останутся в истории',
  );
  await expect(
    page.getByRole('button', { name: 'Скачать мои ответы' }),
  ).toBeVisible();
  expect((await history(page)).entries[0]?.answers).toEqual(saved.answers);
  await page.unroute('**/result.worker-*.js');
  await page.getByRole('button', { name: 'Повторить восстановление' }).click();
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '21 из 21',
  );
});

test('saved results retain a functional fallback when Worker is unavailable', async ({
  page,
}) => {
  await seed(page, [attempt(21)]);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(url());
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '21 из 21',
  );
  const details = await review(page, 14);
  await details.getByRole('radio', { name: /^0 балл/u }).check();
  await expect(page.locator('.result-screen .result-summary')).toContainText(
    '18 из 21',
  );
});
