import { expect, test } from 'vitest';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
  variant13Alternatives,
  variantSeed,
} from './index';
import { createVariantSourceDataset } from './source-dataset';
import { variantConditionsText, variantConditionTasks } from './conditions';
import { fileMemoText } from './file-memo';
import { createExamDataset } from './exam-dataset';
import { verifyArchive } from '../datasets';
import { packZip, readZip } from '../datasets/zip';

test('conditions retain every statement and figure, both №13 alternatives, and no review sections', () => {
  for (const { id } of fixedVariants) {
    const variant = buildFixedVariant(id, 'document');
    const tasks = variantConditionTasks(variant);
    expect(tasks).toHaveLength(17);
    expect(
      tasks
        .filter((task) => task.taskNumber === 13)
        .map((task) => task.variant13),
    ).toEqual(['presentation', 'document']);
    const text = variantConditionsText(variant);
    for (const task of tasks) {
      expect(text).toContain(task.statement);
      if (task.figure) expect(text).toContain(task.figure.description);
    }
    expect(text).not.toMatch(
      /Ответ \/ эталон|#### Решение|#### Учебные критерии/u,
    );
  }
  expect(fileMemoText()).toContain('SHA-256');
  expect(fileMemoText()).toContain('Презентация .odp');
  expect(fileMemoText()).toContain('Текстовый документ .odt');
});

test.each(['fixed', 'generated'] as const)(
  '%s source package preserves exact input archives, rejects damage and excludes review files',
  async (kind) => {
    const variant =
      kind === 'fixed'
        ? buildFixedVariant('V01', 'document')
        : buildVariant('файлы + 🧩', 'document');
    const dataset = await createVariantSourceDataset(variant);
    expect(await verifyArchive(dataset.manifest, dataset.archive)).toEqual(
      dataset.manifest,
    );
    expect([...dataset.files.keys()].sort()).toEqual([
      'README.txt',
      'conditions.txt',
      'files/11.manifest.json',
      'files/11.zip',
      'files/12.manifest.json',
      'files/12.zip',
      'files/13-document.manifest.json',
      'files/13-document.zip',
      'files/13-presentation.manifest.json',
      'files/13-presentation.zip',
      'files/14.manifest.json',
      'files/14.zip',
    ]);
    const alternatives = variant13Alternatives(variantSeed(variant));
    for (const task of [
      ...variant.tasks.filter((row) => [11, 12, 14].includes(row.taskNumber)),
      alternatives.presentation,
      alternatives.document,
    ]) {
      const key =
        task.variant13 === 'presentation'
          ? '13-presentation'
          : task.variant13 === 'document'
            ? '13-document'
            : String(task.taskNumber);
      const bytes = dataset.files.get(`files/${key}.zip`);
      if (!bytes) throw new Error('Missing source archive');
      const expected = await createExamDataset(task);
      expect(bytes).toEqual(expected.archive);
      const manifest = JSON.parse(
        new TextDecoder().decode(
          dataset.files.get(`files/${key}.manifest.json`),
        ),
      ) as unknown;
      expect(await verifyArchive(manifest, bytes)).toEqual(expected.manifest);
      expect([...readZip(bytes).keys()].join('\n')).not.toMatch(
        /reference\/|examples\/|criteria|answers|checks/u,
      );
    }
    const altered = new Map(dataset.files);
    altered.set('conditions.txt', new TextEncoder().encode('Чужие условия'));
    await expect(
      verifyArchive(dataset.manifest, packZip(altered)),
    ).rejects.toThrow(/SHA-256/u);
    const foreign = structuredClone(variant);
    const first = foreign.tasks[0];
    if (!first) throw new Error('Missing task');
    first.statement = 'Подменённое условие';
    await expect(createVariantSourceDataset(foreign)).rejects.toThrow(
      /не соответствует/u,
    );
  },
  60_000,
);
