import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { confirmedShortGenerators } from '../../src/core/generators/exam/short-generators';

const gallery = 'http://127.0.0.1:4324/test-oge-app/dev/generators/';
test('exam formats №1–10: Node and browser agree on all answers, policies and diagrams', async ({
  page,
}) => {
  await page.goto(gallery);
  const seeds = ['', 'Пример 🧩', 'golden-1'];
  const actual = await page.evaluate(async (seeds) => {
    const path = '/test-oge-app/src/core/generators/exam/short-generators.ts';
    const { confirmedShortGenerators } = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../../src/core/generators/exam/short-generators');
    const checkerPath = '/test-oge-app/src/core/checker/index.ts';
    const { checkTaskAnswer } = (await import(
      /* @vite-ignore */ checkerPath
    )) as typeof import('../../src/core/checker');
    return confirmedShortGenerators.map((generator) =>
      seeds.map((seed) => {
        const task = generator.generate(seed);
        if (task.answer.type === 'artifact')
          throw new Error('Expected short answer');
        return {
          task,
          verified: generator.verify(task),
          accepted: [
            task.answer.value,
            ...(task.answer.type === 'sequence'
              ? (task.answer.alternatives ?? [])
              : []),
          ].map((answer) => checkTaskAnswer(task, answer).verdict),
        };
      }),
    );
  }, seeds);
  expect(actual).toEqual(
    confirmedShortGenerators.map((generator) =>
      seeds.map((seed) => {
        const task = generator.generate(seed);
        return {
          task,
          verified: true,
          accepted: Array<string>(
            task.answer.type === 'sequence'
              ? 1 + (task.answer.alternatives?.length ?? 0)
              : 1,
          ).fill('correct'),
        };
      }),
    ),
  );
});

test('exam road diagram: arrows, text alternative and mobile accessibility in both themes', async ({
  page,
}) => {
  await page.goto(gallery);
  await page.getByLabel('Seed', { exact: true }).fill('browser-exam-paths');
  await page
    .getByRole('combobox', { name: 'Генератор', exact: true })
    .selectOption('paths-diagram-v2');
  await page.getByRole('button', { name: 'Показать 20 задач' }).click();
  const examples = page.locator('.generator-example'),
    first = examples.first();
  await expect(examples).toHaveCount(20);
  const task = confirmedShortGenerators
    .find((generator) => generator.id === 'paths-diagram-v2')
    ?.generate('browser-exam-paths:0');
  if (task?.figure?.kind !== 'directed-graph') throw new Error('Missing graph');
  await expect(first.getByRole('img')).toBeVisible();
  await expect(first.locator('svg path[marker-end]')).toHaveCount(
    task.figure.edges.length,
  );
  await expect(first).toContainText(task.figure.description);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('exam tables and alternative answers stay readable on mobile', async ({
  page,
}) => {
  await page.goto(gallery);
  for (const id of [
    'shortest-road-v2',
    'parameter-any-v2',
    'decode-repeated-v2',
  ]) {
    await page
      .getByRole('combobox', { name: 'Генератор', exact: true })
      .selectOption(id);
    await page.getByRole('button', { name: 'Показать 20 задач' }).click();
    const first = page.locator('.generator-example').first();
    await expect(first.getByRole('table')).toBeVisible();
    if (id === 'parameter-any-v2')
      await expect(first).toContainText('Принимается любое целое');
    if (id === 'decode-repeated-v2')
      await expect(first).toContainText('Также принимаются:');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
