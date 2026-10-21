import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { buildFixedVariant, buildVariant } from '../../src/core/variants';
import { variantConditionsText } from '../../src/core/variants/conditions';
import { readZip, packZip } from '../../src/core/datasets/zip';
import { verifyArchive } from '../../src/core/datasets';

test('variant source download verifies exact files and detects modified or oversized archives', async ({
  page,
}) => {
  await page.goto('variants/V01/');
  const materials = page.locator('.variant-files');
  await materials.locator('summary').focus();
  await page.keyboard.press('Enter');
  await materials
    .getByRole('button', { name: 'Подготовить комплект варианта' })
    .click();
  const downloading = page.waitForEvent('download');
  await materials.getByRole('link', { name: 'Скачать комплект ZIP' }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('Missing variant download');
  const bytes = await readFile(path);
  const files = readZip(bytes);
  expect(new TextDecoder().decode(files.get('conditions.txt'))).toBe(
    variantConditionsText(buildFixedVariant('V01')),
  );
  expect(files.has('files/13-presentation.zip')).toBe(true);
  expect(files.has('files/13-document.zip')).toBe(true);
  expect(files.size).toBe(12);
  for (const [name, value] of files) {
    if (name.endsWith('.zip'))
      expect([...readZip(value).keys()].join('\n')).not.toMatch(
        /reference|examples|criteria|answers|checks/u,
      );
  }
  const manifestDownloading = page.waitForEvent('download');
  await materials.getByRole('link', { name: 'Скачать манифест' }).click();
  const manifestPath = await (await manifestDownloading).path();
  if (!manifestPath) throw new Error('Missing manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  await verifyArchive(manifest, bytes);
  const input = materials.getByLabel('Проверить скачанный комплект ZIP');
  await input.setInputFiles({
    name: 'sources.zip',
    mimeType: 'application/zip',
    buffer: bytes,
  });
  await expect(materials.getByRole('status')).toContainText([
    'Комплект готов',
    'Комплект совпадает',
  ]);
  const changed = new Map(files);
  changed.set(
    'conditions.txt',
    new TextEncoder().encode('Подменённый вариант'),
  );
  await input.setInputFiles({
    name: 'sources.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(packZip(changed)),
  });
  await expect(materials.getByRole('alert')).toContainText('SHA-256');
  await input.setInputFiles({
    name: 'large.zip',
    mimeType: 'application/zip',
    buffer: Buffer.alloc(10_485_761),
  });
  await expect(materials.getByRole('alert')).toContainText('больше 10 МиБ');
  await input.setInputFiles({
    name: 'sources.zip',
    mimeType: 'application/zip',
    buffer: bytes,
  });
  await expect(materials.getByRole('alert')).toHaveCount(0);
  await expect(materials).toContainText('Комплект совпадает');
});

test('files remain available in a timed exam without exposing review or pausing the clock', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-21T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-21T10:01:00Z'));
  await page.goto('variants/V01/?exam=1');
  await page.getByRole('radio', { name: '13.2 — Документ' }).check();
  await page
    .getByRole('button', { name: 'Начать экзамен', exact: true })
    .click();
  await expect(page.getByRole('timer')).toHaveText('02:30:00');
  const materials = page.locator('.variant-files');
  await materials.locator('summary').click();
  await expect(materials).toContainText('не останавливает 150 минут');
  await expect(
    materials.getByRole('link', { name: /для печати/u }),
  ).toHaveAttribute('target', '_blank');
  await page.clock.runFor(60000);
  await expect(page.getByRole('timer')).toHaveText('02:29:00');
  await expect(
    page.getByRole('button', {
      name: /Проверить ответ|подсказку|решение по шагам/u,
    }),
  ).toHaveCount(0);
});

test('fixed and seeded print views show all conditions, both №13 works and diagrams without review', async ({
  page,
}) => {
  const seed = 'Печать + <script>🧩';
  for (const query of ['id=V01', new URLSearchParams({ seed }).toString()]) {
    await page.goto(`variants/print/?${query}`);
    await expect(page.locator('.variant-print-task')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Подготовить условия для печати' })
      .click();
    await expect(page.locator('.variant-print-task')).toHaveCount(17);
    const variant =
      query === 'id=V01' ? buildFixedVariant('V01') : buildVariant(seed);
    const task = variant.tasks[0];
    if (!task) throw new Error('Missing condition');
    await expect(
      page.locator('.variant-print-task').first().locator('.rich-text'),
    ).toContainText(task.statement.replace(/[*_`]/gu, '').slice(0, 35));
    await expect(
      page
        .locator('.variant-print')
        .getByRole('heading', { name: 'Задание №13.1 — Презентация' }),
    ).toBeVisible();
    await expect(
      page
        .locator('.variant-print')
        .getByRole('heading', { name: 'Задание №13.2 — Документ' }),
    ).toBeVisible();
    await expect(page.locator('.variant-print svg')).toHaveCount(1);
    await expect(
      page.getByText('Ответ / эталон:', { exact: false }),
    ).toHaveCount(0);
    await page.getByLabel('Тема', { exact: true }).selectOption('dark');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Печатать условия и памятку' }),
    ).toBeHidden();
    await expect(page.locator('.variant-print-task').last()).toBeVisible();
    expect(
      await page
        .locator('.variant-print')
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe('rgb(17, 17, 17)');
    await page.emulateMedia({ media: 'screen' });
  }
  await page.goto('variants/print/?id=V01&seed=other');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось открыть вариант',
  );
  await expect(page.locator('.variant-print-task')).toHaveCount(0);
});

test('memo, integrity control and print conditions are accessible at 200% text in both themes', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('variants/V01/');
  await page.locator('.variant-files summary').click();
  await page
    .getByRole('button', { name: 'Подготовить комплект варианта' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Скачать комплект ZIP' }),
  ).toBeVisible();
  for (const route of [null, 'variants/print/?id=V01']) {
    if (route) {
      await page.goto(route);
      await page
        .getByRole('button', { name: 'Подготовить условия для печати' })
        .click();
      await expect(page.locator('.variant-print-task')).toHaveCount(17);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Тема', { exact: true }).selectOption(theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
