import { createDataset, type Dataset, type SourceFile } from '../datasets';
import { VariantSchema } from '../schemas/variant';
import { createTaskDataset } from '../generators/task-dataset';
import type { Variant } from '../types';
import {
  buildFixedVariant,
  buildVariant,
  selectedVariant13,
  VARIANT_VERSION,
  variant13Alternatives,
  variantFileKey,
  variantFileTasks,
  variantSeed,
} from './index';
import { variantMarkdown } from './sample';

export function validateBuiltVariant(input: unknown): Variant {
  const variant = VariantSchema.parse(input),
    selection = selectedVariant13(variant);
  const expected =
    variant.kind === 'fixed'
      ? buildFixedVariant(variant.id, selection)
      : buildVariant(variant.seed, selection);
  if (JSON.stringify(variant) !== JSON.stringify(VariantSchema.parse(expected)))
    throw new Error(
      'Вариант не соответствует своему seed или фиксированному идентификатору.',
    );
  return variant;
}
/** Review package including references; exam-mode materials are a separate UI concern. */
export async function createVariantDataset(input: unknown): Promise<Dataset> {
  const variant = validateBuiltVariant(input),
    seed = variantSeed(variant),
    selection = selectedVariant13(variant);
  const sources: SourceFile[] = [];
  const text = (path: string, value: string) => {
    sources.push({
      path,
      format: 'txt',
      bytes: new TextEncoder().encode(value.trimEnd() + '\n'),
      license: 'CC0-1.0',
    });
  };
  const json = (path: string, value: unknown) => {
    sources.push({
      path,
      format: 'json',
      bytes: new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n'),
      license: 'CC0-1.0',
    });
  };
  const tasks = variantFileTasks(variant),
    children = await Promise.all(tasks.map(createTaskDataset));
  text(
    'README.txt',
    'Авторский учебный комплект варианта для разбора. CC0-1.0. Персональные данные не нужны.\nvariant.txt содержит условия, ответы, решения и учебные критерии. variant.json содержит ровно 16 заданий с одной выбранной работой №13; alternatives13.json — обе альтернативы №13. Максимум — 21 балл, №15 и №16 выполняются оба. Формат сверенного проекта ОГЭ 2027, не официальный вариант ФИПИ.\nВ files находятся семь самостоятельных ZIP и их манифесты: №11, №12, обе альтернативы №13, №14, №15 и №16. Распаковывай каждый ZIP в отдельную папку; исходные пути, байты и лицензии сохранены. index.json связывает задание с файлами. При смене выбора №13 в подсчёт включается только соответствующая работа, остальные задания не меняются.\nКомплект содержит эталоны и предназначен для проверки и разбора. Для самостоятельного решения сначала прочитай условие и используй исходные материалы, затем сравни с эталонами. Выполнение Python — локально по инструкции набора №16; JSON полей Робота — наш учебный формат.',
  );
  text('variant.txt', variantMarkdown(variant));
  json('variant.json', variant);
  json('alternatives13.json', variant13Alternatives(seed));
  json('index.json', {
    version: VARIANT_VERSION,
    seed,
    selected13: selection,
    taskCount: 16,
    maxScore: 21,
    datasets: tasks.map((task, index) => ({
      taskId: task.id,
      taskNumber: task.taskNumber,
      ...(task.variant13 ? { variant13: task.variant13 } : {}),
      datasetId: children[index]?.manifest.id,
      archive: `files/${variantFileKey(task)}.zip`,
      manifest: `files/${variantFileKey(task)}.manifest.json`,
    })),
  });
  for (const [index, task] of tasks.entries()) {
    const child = children[index];
    if (!child) throw new Error('Отсутствует файловый набор задания.');
    sources.push({
      path: `files/${variantFileKey(task)}.zip`,
      format: 'zip',
      bytes: child.archive,
      license: 'CC0-1.0',
    });
    json(`files/${variantFileKey(task)}.manifest.json`, child.manifest);
  }
  return createDataset(
    `${VARIANT_VERSION}:files:${variant.id}:${selection}`,
    seed,
    VARIANT_VERSION,
    sources,
  );
}
