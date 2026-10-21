import { buildFixedVariant, buildVariant } from './index';
import { fixedVariants, VARIANT_VERSION } from './catalog';
import type { ExamDraft } from './exam';
/** Rebuild the exact saved variant; never reinterpret an unknown version or seed. */
export function buildExamVariant(
  draft: Pick<ExamDraft, 'variantId' | 'variant13' | 'seed'>,
) {
  const fixed = fixedVariants.find((row) => row.id === draft.variantId);
  if (fixed && fixed.seed === draft.seed)
    return buildFixedVariant(fixed.id, draft.variant13);
  if (!fixed && draft.variantId === `${VARIANT_VERSION}:${draft.seed}`)
    return buildVariant(draft.seed, draft.variant13);
  throw new Error(
    'Этот вариант не воспроизводится из текущего каталога. Сохрани ответы через экспорт в настройках.',
  );
}
