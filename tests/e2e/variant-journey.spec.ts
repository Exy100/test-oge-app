import { expect, test } from '../fixtures/security-browser';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { buildFixedVariant } from '../../src/core/variants';
import { areaSchemas, PREFIX } from '../../src/core/storage/schemas';

async function history(page: Page) {
  return areaSchemas.variantAttempts.parse(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
      PREFIX + 'variantAttempts',
    ),
  ).entries;
}

for (const choice of ['presentation', 'document'] as const) {
  test(`complete exam journey: ${choice}, deadline, assessment and history`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    // Test-only acceleration: the deployed application still uses 150 minutes.
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') });
    const variant = buildFixedVariant('V01', choice);
    await page.goto('variants/V01/');
    await page.getByRole('button', { name: 'Пройти с таймером' }).click();
    await page
      .getByRole('radio', {
        name:
          choice === 'presentation' ? '13.1 — Презентация' : '13.2 — Документ',
      })
      .check();
    // Let entry/setup render with real frames; freeze immediately before Start.
    await page.clock.pauseAt(new Date('2026-10-22T03:01:00Z'));
    await page
      .getByRole('button', { name: 'Начать экзамен', exact: true })
      .click();
    await expect(page.getByRole('timer')).toHaveText('02:30:00');
    const answers = new Map<number, string>();
    const number = (n: number) =>
      page
        .getByRole('navigation', { name: 'Задания экзамена' })
        .getByRole('button', {
          name: new RegExp(`^Задание №${String(n)},`, 'u'),
        });
    for (const task of variant.tasks) {
      const n = task.taskNumber;
      await number(n).click();
      const value =
        task.answer.type !== 'artifact'
          ? task.answer.value
          : n === 13
            ? choice === 'presentation'
              ? 'моя-презентация.odp'
              : 'мой-документ.odt'
            : n === 14
              ? 'моя-таблица.ods'
              : n === 15
                ? 'использовать Робот\nалг\nнач\nзакрасить\nкон'
                : 'n = int(input())\nprint(n)\n';
      answers.set(n, value);
      const label =
        n <= 12
          ? 'Твой ответ'
          : n <= 14
            ? 'Имя файла с твоей работой'
            : n === 15
              ? 'Программа Робота'
              : 'Код Python';
      await page.getByLabel(label, { exact: true }).fill(value);
      await page
        .getByLabel('Черновик решения')
        .fill(`Моя запись №${String(n)}`);
    }
    await expect(
      page.getByRole('button', { name: 'Проверить ответ', exact: true }),
    ).toHaveCount(0);
    await page.clock.runFor(10000);
    await page.reload();
    await page
      .getByRole('button', { name: 'Продолжить экзамен', exact: true })
      .click();
    await expect(page.getByRole('timer')).toHaveText('02:29:50');
    await number(16).click();
    await expect(page.getByLabel('Код Python', { exact: true })).toHaveValue(
      answers.get(16) ?? '',
    );
    // Keep the last edit dirty: expiry must save it, not the older autosave.
    const finalCode = '# последняя правка\n' + (answers.get(16) ?? '');
    await page.clock.fastForward(150 * 60000 - 11000);
    await expect(page.getByRole('timer')).toHaveText('00:00:01');
    await expect(
      page.getByRole('heading', { name: 'Экзамен завершён' }),
    ).toHaveCount(0);
    await page.getByLabel('Код Python', { exact: true }).fill(finalCode);
    answers.set(16, finalCode);
    await page.clock.runFor(1000);
    await expect(
      page.getByRole('heading', { name: 'Экзамен завершён' }),
    ).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
    const summary = page.locator('.result-screen .result-summary');
    await expect(summary).toContainText('Результат неполный: 12 учтено из 21');
    await expect(
      page.locator('.result-screen .result-table tbody tr'),
    ).toHaveCount(16);
    const completed = await history(page);
    expect(completed).toHaveLength(1);
    const attempt = completed[0];
    if (!attempt) throw new Error('Missing completed attempt');
    expect(attempt.elapsedMs).toBe(150 * 60000);
    expect(Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt)).toBe(
      150 * 60000,
    );
    expect(attempt.variant13).toBe(choice);
    expect(attempt.answers).toHaveLength(16);
    for (const [taskNumber, text] of answers) {
      expect(
        attempt.answers.find((row) => row.taskNumber === taskNumber),
      ).toMatchObject({
        text,
        reasoning: `Моя запись №${String(taskNumber)}`,
      });
    }
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
        PREFIX + 'variantDraft',
      ),
    ).toMatchObject({ current: null });
    // Deadline assertions are complete. Result navigation needs real browser frames.
    await page.clock.resume();
    // Deliberately varied self-assessments; these do not certify the sample work.
    for (const [n, score] of [
      [13, 2],
      [14, 3],
      [15, 0],
      [16, 1],
    ] as const) {
      const details = page.locator(`#result-task-${String(n)}`);
      await details.locator(':scope > summary').click();
      await expect(details.locator('.exam-saved-answer')).toHaveText(
        (answers.get(n) ?? '').trim(),
      );
      await details
        .getByRole('radio', { name: new RegExp(`^${String(score)} балл`, 'u') })
        .check();
    }
    await expect(summary).toContainText('Первичный балл: 18 из 21');
    await expect(summary).toContainText('Ориентировочная отметка: 5');
    await expect(page.getByRole('link', { name: /^№15:/u })).toBeVisible();
    await page
      .getByRole('link', { name: 'Все варианты и история', exact: true })
      .click();
    const rows = page.locator('.variant-history-table tbody tr');
    await expect(rows).toHaveCount(1);
    await rows.getByRole('link').click();
    await expect(page).toHaveURL(/\/result\/\?attempt=/u);
    await expect(summary).toContainText('Первичный балл: 18 из 21');
    await page.reload();
    await expect(summary).toContainText('Первичный балл: 18 из 21');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать мои ответы' }).click();
    const path = await (await downloading).path();
    if (!path) throw new Error('Missing answer export');
    const exported = JSON.parse(await readFile(path, 'utf8')) as unknown;
    expect(exported).toMatchObject({
      id: attempt.id,
      score: 18,
      answers: attempt.answers,
    });
    expect(await history(page)).toHaveLength(1);
    expect((await history(page))[0]?.answers).toEqual(attempt.answers);
    expect(errors).toEqual([]);
  });
}
