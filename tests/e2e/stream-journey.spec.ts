import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  first,
  link,
  ready,
  stats,
  current,
  answer,
} from '../fixtures/stream-browser';

test.use({ video: 'on' });
test('20 tasks: correct, wrong, malformed, hints, solution, filters, shared link and persisted results', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.goto(link(first, '1,2,3,4,5,6,7,8,9,10'));
  await ready(page);
  let correctCount = 0;
  for (let index = 0; index < 20; index++) {
    await test.step(`Задание ${String(index + 1)}`, async () => {
      const task = current(page);
      const input = page.getByLabel('Твой ответ', { exact: true });
      if (index === 0 || index === 9) {
        await page.getByLabel('Как я решал').fill('Мой черновик');
        for (let hint = 0; hint < 3; hint++) {
          await page
            .getByRole('button', {
              name: `Открыть подсказку ${String(hint + 1)} из 3`,
              exact: true,
            })
            .click();
          await expect(
            page.locator('.task-guidance [id$="-hints"] li'),
          ).toHaveCount(hint + 1);
        }
        for (let step = 0; step < task.solution.length; step++) {
          await page
            .getByRole('button', {
              name: step
                ? 'Следующий шаг решения'
                : 'Показать решение по шагам',
              exact: true,
            })
            .click();
          await expect(
            page.locator('.task-guidance [id$="-solution"] li'),
          ).toHaveCount(step + 1);
        }
        await expect(page.getByLabel('Как я решал')).toHaveValue(
          'Мой черновик',
        );
        expect((await stats(page)).completed).toBe(index);
      }
      if (index % 4 === 0) {
        await input.fill('');
        await input.press('Enter');
        await expect(input).toBeFocused();
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        expect((await stats(page)).completed).toBe(index);
      }
      if (index === 9) {
        const statementHtml = await page
          .locator('.task-card > .rich-text-container > .rich-text')
          .innerHTML();
        await page
          .getByRole('button', { name: 'Скопировать ссылку на задачу' })
          .click();
        const url = await page
          .getByLabel('Ссылка на задачу', { exact: true })
          .inputValue();
        const replay = await context.newPage();
        try {
          await replay.goto(url);
          await ready(replay);
          await expect(
            replay.locator('.task-card > .rich-text-container > .rich-text'),
          ).toHaveJSProperty('innerHTML', statementHtml);
          expect(new URL(replay.url()).searchParams.get('numbers')).toBe(
            '1,2,10',
          );
        } finally {
          await replay.close();
        }
      }
      const correct = index % 3 !== 1;
      correctCount += Number(correct);
      await input.fill(answer(task, correct));
      await input.press('Enter');
      const feedback = page.locator('.task-feedback');
      await expect(feedback).toHaveAttribute(
        'data-verdict',
        correct ? 'correct' : 'incorrect',
      );
      await expect(feedback).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Проверить ответ', exact: true }),
      ).toBeDisabled();
      const saved = await stats(page);
      expect(saved.completed).toBe(index + 1);
      expect(saved.entries.reduce((sum, row) => sum + row.attempts, 0)).toBe(
        index + 1,
      );
      expect(saved.entries.reduce((sum, row) => sum + row.correct, 0)).toBe(
        correctCount,
      );
      if (index === 5) {
        await page.getByText('Фильтры заданий', { exact: true }).click();
        for (let number = 3; number <= 9; number++)
          await page
            .getByRole('checkbox', {
              name: `№${String(number)}`,
              exact: true,
            })
            .uncheck();
        await page
          .getByRole('button', { name: 'Применить фильтры', exact: true })
          .click();
      } else {
        await page.keyboard.press(index % 2 ? 'n' : 'ArrowRight');
      }
      await ready(page);
      await expect(page.locator('.stream-position')).toContainText(
        `Задание ${String(index + 2)}`,
      );
      await expect(page.locator('.stream-position')).toBeFocused();
      await expect(page.getByLabel('Как я решал')).toHaveValue('');
      await expect(
        page.locator('.task-guidance [id$="-hints"] li'),
      ).toHaveCount(0);
      if (index === 10)
        await page.getByLabel('Тема', { exact: true }).selectOption('dark');
    });
  }
  await expect(page.locator('.stream-progress')).toContainText(
    'Верно 13 из 20',
  );
  await expect(page.locator('.progress-accuracy')).toHaveText('65%');
  await page.reload();
  await ready(page);
  await expect(page.locator('.stream-position')).toContainText('Задание 21');
  await expect(page.locator('.stream-progress')).toContainText(
    'Верно 13 из 20',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
