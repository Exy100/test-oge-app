import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildFixedVariant, variantSeed } from '../../src/core/variants';
import {
  createExamDraft,
  type ExamAttempt,
} from '../../src/core/variants/exam';
import { PREFIX } from '../../src/core/storage/schemas';
import { attemptResultHref } from '../../src/lib/variant-links';

export const aiVariant = buildFixedVariant('V01', 'document');
export const aiAttempt: ExamAttempt = {
  ...createExamDraft(
    {
      id: 'ai-result',
      variantId: 'V01',
      seed: variantSeed(aiVariant),
      variant13: 'document',
    },
    Date.UTC(2026, 9, 31),
  ),
  answers: aiVariant.tasks.map((task) => ({
    taskNumber: task.taskNumber,
    text:
      task.taskNumber >= 15
        ? 'print(1)'
        : task.taskNumber >= 13
          ? 'my-file.odt'
          : task.answer.type === 'artifact'
            ? ''
            : task.answer.value,
    reasoning: '',
  })),
  assessments: [{ taskNumber: 16, score: 0, source: 'self' }],
  elapsedMs: 60000,
  finishedAt: '2026-10-31T00:01:00.000Z',
  score: null,
};
export async function readyAiResult(page: Page, baseURL: string | undefined) {
  const href = attemptResultHref(aiAttempt);
  if (!href || !baseURL) throw new Error('Missing result fixture');
  await page.addInitScript(
    ({ key, attempt }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, entries: [attempt] }),
        );
    },
    { key: PREFIX + 'variantAttempts', attempt: aiAttempt },
  );
  const url = new URL(href, baseURL);
  url.protocol = 'http:';
  url.port = '4324';
  await page.route('**/api/ai/health', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.goto(url.href);
  await expect(
    page.getByRole('heading', { name: 'Экзамен завершён', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Таблица результатов 16 заданий' }),
  ).toBeVisible();
}
export async function savedAiAttempt(page: Page) {
  return page.evaluate(
    (key) =>
      (
        JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}') as {
          entries: ExamAttempt[];
        }
      ).entries.find((row) => row.id === 'ai-result'),
    PREFIX + 'variantAttempts',
  );
}

export async function checkAiAppearance(page: Page, selector: string) {
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      (await new AxeBuilder({ page }).include(selector).analyze()).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
}
