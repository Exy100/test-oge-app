import { createDataset, type SourceFile } from '../datasets';
import { validateBuiltVariant } from './dataset';
import { createExamDataset } from './exam-dataset';
import { variantConditionsText, variantConditionTasks } from './conditions';
import { fileMemoText } from './file-memo';
import { VARIANT_VERSION, variantFileKey, variantSeed } from './index';

/** Shared safe package for preview, timed work and printing. Both №13 choices. */
export async function createVariantSourceDataset(input: unknown) {
  const variant = validateBuiltVariant(input);
  const sources: SourceFile[] = [];
  const text = (path: string, value: string) =>
    sources.push({
      path,
      format: 'txt',
      license: 'CC0-1.0',
      bytes: new TextEncoder().encode(value),
    });
  text(
    'README.txt',
    'Авторский учебный комплект исходников. CC0-1.0. Ответов и эталонов нет.\nconditions.txt — все условия, включая обе работы №13. Для №15–16 используй условие и рабочее место на сайте; Python запускается на компьютере.\n\n' +
      fileMemoText(),
  );
  text('conditions.txt', variantConditionsText(variant));
  for (const task of variantConditionTasks(variant).filter(
    (row) => row.taskNumber >= 11 && row.taskNumber <= 14,
  )) {
    const child = await createExamDataset(task);
    const key = variantFileKey(task);
    sources.push({
      path: `files/${key}.zip`,
      format: 'zip',
      license: 'CC0-1.0',
      bytes: child.archive,
    });
    sources.push({
      path: `files/${key}.manifest.json`,
      format: 'json',
      license: 'CC0-1.0',
      bytes: new TextEncoder().encode(
        JSON.stringify(child.manifest, null, 2) + '\n',
      ),
    });
  }
  return createDataset(
    `${VARIANT_VERSION}:sources:${variant.id}`,
    variantSeed(variant),
    `${VARIANT_VERSION}:sources`,
    sources,
  );
}
