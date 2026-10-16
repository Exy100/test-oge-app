import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { confirmedFileGenerators } from '../../src/core/generators/exam/file-generators';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { sha256 } from '../../src/core/datasets';
const gallery = 'http://127.0.0.1:4324/test-oge-app/dev/generators/';

test('file corpora and answer policies match Node; original JPEGs decode into real images', async ({
  page,
}) => {
  await page.goto(gallery);
  const actual = await page.evaluate(async () => {
    const path = '/test-oge-app/src/core/generators/exam/file-generators.ts',
      datasetPath = '/test-oge-app/src/core/generators/task-dataset.ts',
      hashPath = '/test-oge-app/src/core/datasets/index.ts',
      jpegPath = '/test-oge-app/src/core/datasets/jpeg.ts';
    const { confirmedFileGenerators } = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../../src/core/generators/exam/file-generators');
    const { createTaskDataset } = (await import(
      /* @vite-ignore */ datasetPath
    )) as typeof import('../../src/core/generators/task-dataset');
    const { sha256 } = (await import(
      /* @vite-ignore */ hashPath
    )) as typeof import('../../src/core/datasets');
    const { originalJpeg } = (await import(
      /* @vite-ignore */ jpegPath
    )) as typeof import('../../src/core/datasets/jpeg');
    const images: { width: number; height: number; colors: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(originalJpeg(i))], { type: 'image/jpeg' }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Missing canvas');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data,
          colors = new Set<number>();
        for (let offset = 0; offset < pixels.length; offset += 4)
          colors.add(
            (pixels[offset] ?? 0) * 65536 +
              (pixels[offset + 1] ?? 0) * 256 +
              (pixels[offset + 2] ?? 0),
          );
        images.push({
          width: image.naturalWidth,
          height: image.naturalHeight,
          colors: colors.size,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return {
      images,
      corpora: await Promise.all(
        confirmedFileGenerators.map(async (generator) => {
          const task = generator.generate('browser-files'),
            dataset = await createTaskDataset(task);
          return {
            task,
            verified: generator.verify(task),
            manifest: dataset.manifest,
            archiveSha256: await sha256(dataset.archive),
          };
        }),
      ),
    };
  });
  for (const image of actual.images) {
    expect(image.width).toBe(96);
    expect(image.height).toBe(72);
    expect(image.colors).toBeGreaterThan(8);
  }
  expect(actual.corpora).toEqual(
    await Promise.all(
      confirmedFileGenerators.map(async (generator) => {
        const task = generator.generate('browser-files'),
          dataset = await createTaskDataset(task);
        return {
          task,
          verified: true,
          manifest: dataset.manifest,
          archiveSha256: await sha256(dataset.archive),
        };
      }),
    ),
  );
});
for (const generator of confirmedFileGenerators)
  test(`${generator.id}: real ZIP download, readable previews and accessible mobile selection`, async ({
    page,
  }) => {
    await page.goto(gallery);
    await page.getByLabel('Seed', { exact: true }).fill('browser-files');
    await page
      .getByRole('combobox', { name: 'Генератор', exact: true })
      .selectOption(generator.id);
    await page.getByRole('button', { name: 'Показать 20 задач' }).click();
    const first = page.locator('.generator-example').first();
    await expect(page.locator('.generator-example')).toHaveCount(20);
    await first.getByRole('button', { name: 'Подготовить файлы' }).click();
    const link = first.getByRole('link', { name: 'Скачать ZIP', exact: true });
    await expect(link).toBeVisible();
    const pending = page.waitForEvent('download');
    await link.click();
    const path = await (await pending).path();
    if (!path) throw new Error('Missing ZIP');
    const dataset = await createTaskDataset(
      generator.generate('browser-files:0'),
    );
    expect(await readFile(path)).toEqual(Buffer.from(dataset.archive));
    const htm = dataset.manifest.files.find(({ format }) => format === 'htm');
    if (!htm) throw new Error('Missing text');
    await first.getByLabel('Файл для просмотра').selectOption(htm.path);
    await expect(first.locator('.task-file-preview')).toContainText('Автор:');
    await expect(first.locator('.task-file-preview')).not.toContainText('<p>');
    if (generator.taskNumber === 12)
      for (const format of ['pdf', 'tiff', 'jpeg']) {
        const file = dataset.manifest.files.find(
          (file) => file.format === format,
        );
        if (!file) throw new Error('Missing binary format');
        await first.getByLabel('Файл для просмотра').selectOption(file.path);
        await expect(first.locator('.task-file-preview')).toContainText(
          format === 'pdf' ? 'Документ PDF' : 'Изображение',
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
