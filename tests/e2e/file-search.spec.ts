import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generatorsForTask } from '../../src/core/generators';
import { createTaskDataset } from '../../src/core/generators/task-dataset';

for (const generator of generatorsForTask(11)) {
  test(`${generator.id}: downloaded files match preview and Node`, async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:4324/test-oge-app/dev/generators/');
    await page
      .getByRole('combobox', { name: 'Генератор', exact: true })
      .selectOption(generator.id);
    await page.getByLabel('Seed', { exact: true }).fill('file-browser');
    await page.getByRole('button', { name: 'Показать 20 задач' }).click();
    const example = page.locator('.generator-example').first();
    await example.getByRole('button', { name: 'Подготовить файлы' }).click();
    const expected = await createTaskDataset(
      generator.generate('file-browser:0'),
    );
    for (const [name, bytes] of [
      ['Скачать ZIP', expected.archive],
      [
        'Скачать манифест',
        new TextEncoder().encode(
          JSON.stringify(expected.manifest, null, 2) + '\n',
        ),
      ],
    ] as const) {
      const pending = page.waitForEvent('download');
      await example.getByRole('link', { name, exact: true }).click();
      const download = await pending;
      const path = await download.path();
      if (!path) throw new Error('Missing download');
      expect(Buffer.compare(await readFile(path), Buffer.from(bytes))).toBe(0);
    }
    for (const [path, bytes] of expected.files) {
      await example.getByLabel('Файл для просмотра').selectOption(path);
      await expect(example.locator('.task-file-preview')).toHaveText(
        new TextDecoder().decode(bytes),
      );
    }
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
}
