import { expect, test } from '@playwright/test';
import {
  readyAiResult,
  savedAiAttempt,
  checkAiAppearance,
} from '../fixtures/ai-result-browser';

test('programming advice previews exact input, rejects or explicitly accepts a preliminary score with provenance', async ({
  page,
  baseURL,
}) => {
  let calls = 0;
  await page.route('**/api/ai/part2-grade', async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({
      solution: 'print(1)',
      criteriaAnswers: {},
    });
    expect(
      Object.keys(route.request().postDataJSON() as object).sort(),
    ).toEqual(['criteriaAnswers', 'generatorId', 'seed', 'solution']);
    await route.fulfill({
      json: {
        kind: 'preliminary',
        score: 1,
        reason: 'Проверь <img src=x onerror=alert(1)>',
        errors: ['Один крайний случай.'],
        advice: 'Сверь с эталоном.',
      },
    });
  });
  await readyAiResult(page, baseURL);
  await page.locator('#result-task-16 > summary').click();
  const panel = page.locator('#result-task-16 .ai-panel');
  await panel
    .getByRole('button', { name: 'Разобрать работу с ИИ', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('print(1)');
  expect(calls).toBe(0);
  await dialog.getByRole('button', { name: 'Разрешить и отправить' }).click();
  await expect(panel.getByRole('region')).toContainText(
    'Предварительное предложение: 1 из 2',
  );
  await expect(panel.locator('img,script')).toHaveCount(0);
  expect((await savedAiAttempt(page))?.assessments).toEqual([
    { taskNumber: 16, score: 0, source: 'self' },
  ]);
  await panel.getByRole('button', { name: 'Отклонить предложение' }).click();
  expect((await savedAiAttempt(page))?.assessments[0]?.score).toBe(0);
  await panel
    .getByRole('button', { name: 'Разобрать работу с ИИ', exact: true })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Принять предварительный балл' }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await panel
    .getByRole('button', { name: 'Принять предварительный балл' })
    .click();
  await expect(panel).toContainText('Предложение ИИ принято');
  expect((await savedAiAttempt(page))?.assessments).toContainEqual({
    taskNumber: 16,
    score: 1,
    source: 'aiAccepted',
  });
  await checkAiAppearance(page, '#result-task-16');
});
test('office help rejects a fabricated grade and never turns null into zero', async ({
  page,
  baseURL,
}) => {
  let calls = 0;
  await page.route('**/api/ai/part2-grade', async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({
      solution: 'Я настроил стили документа.',
    });
    expect(route.request().postData()).not.toContain('my-file.odt');
    await route.fulfill({
      json: {
        kind: 'criteria-help',
        score: calls === 1 ? 0 : null,
        reason: 'Файл не получен.',
        errors: [],
        advice: 'Сравни оформление с критериями.',
      },
    });
  });
  await readyAiResult(page, baseURL);
  await page.locator('#result-task-13 > summary').click();
  const panel = page.locator('#result-task-13 .ai-panel');
  await panel
    .getByLabel('Описание работы для ИИ')
    .fill('Я настроил стили документа.');
  await panel
    .getByRole('button', { name: 'Разобрать работу с ИИ', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Разрешить и отправить' })
    .click();
  await expect(panel.getByRole('alert')).toContainText('полный разбор');
  await panel.getByRole('button', { name: 'Повторить разбор работы' }).click();
  await expect(panel.getByRole('region')).toContainText('оценка не выставлена');
  await expect(
    panel.getByRole('button', { name: 'Принять предварительный балл' }),
  ).toHaveCount(0);
  expect(
    (await savedAiAttempt(page))?.assessments.some(
      (row) => row.taskNumber === 13,
    ),
  ).toBe(false);
  expect(calls).toBe(2);
});
