import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { link, ready } from '../fixtures/stream-browser';
import { generatorsForTask } from '../../src/core/generators';
import {
  programCases,
  programParameters,
  isProgramKind,
} from '../../src/core/generators/16/problems';
import { referencePython } from '../../src/core/generators/16/programs';
import { expectNoHorizontalOverflow } from './layout';

for (const generator of generatorsForTask(16)) {
  test(`№16 ${generator.subtype}: public practice, ten inputs, source export and accessibility`, async ({
    page,
  }) => {
    const task = generator.generate('exam-formats-browser');
    if (!isProgramKind(task.subtype)) throw new Error('Missing program kind');
    const p = programParameters(task.subtype, task.seed);
    const cases = programCases(p, task.seed);
    await page.goto(link(task));
    await ready(page);
    await expect(page.getByLabel('Код Python', { exact: true })).toBeVisible();
    const select = page.getByLabel('Пример ввода и вывода');
    await expect(select.locator('option')).toHaveCount(10);
    for (const [index, example] of cases.entries()) {
      await select.selectOption(String(index));
      await expect(
        page.getByRole('region', { name: 'Входные данные', exact: true }),
      ).toHaveText(example.input.trim());
      await expect(
        page.getByRole('region', { name: 'Ожидаемый результат', exact: true }),
      ).toHaveText(example.output.trim());
    }
    const code = referencePython(p);
    await page.getByLabel('Код Python', { exact: true }).fill(code);
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Скачать свой код', exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('answer.py');
    const path = await download.path();
    if (!path) throw new Error('Missing source download');
    expect(await readFile(path, 'utf8')).toBe(code);
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await expectNoHorizontalOverflow(page);
  });
}
