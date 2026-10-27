import { buildFixedVariant, buildVariant } from './index';
import { fixedVariants, VARIANT_VERSION } from './catalog';
import type { ExamDraft } from './exam';
import { Rng } from '../rng';
import { learningPythonGenerators } from '../generators/16/programs';
import type { Variant } from '../types';
/** Rebuild the exact saved variant; never reinterpret an unknown version or seed. */
export function buildExamVariant(
  draft: Pick<
    ExamDraft,
    'variantId' | 'variant13' | 'seed' | 'pythonFormatVersion'
  >,
) {
  const restore = (variant: Variant): Variant => {
    if (draft.pythonFormatVersion === 1) return variant;
    const generator = new Rng(draft.seed)
      .fork(`${VARIANT_VERSION}:generator:16`)
      .pick(learningPythonGenerators);
    const task = generator.generate(
      JSON.stringify([VARIANT_VERSION, draft.seed, 16]),
    );
    return {
      ...variant,
      tasks: variant.tasks.map((item) =>
        item.taskNumber === 16 ? task : item,
      ),
    };
  };
  const fixed = fixedVariants.find((row) => row.id === draft.variantId);
  if (fixed && fixed.seed === draft.seed)
    return restore(buildFixedVariant(fixed.id, draft.variant13));
  if (!fixed && draft.variantId === `${VARIANT_VERSION}:${draft.seed}`)
    return restore(buildVariant(draft.seed, draft.variant13));
  throw new Error(
    'Этот вариант не воспроизводится из текущего каталога. Сохрани ответы через экспорт в настройках.',
  );
}
