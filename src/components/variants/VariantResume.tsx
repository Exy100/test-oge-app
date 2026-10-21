import { useStoredAreas } from '../useStoredAreas';
import {
  attemptVariantHref,
  attemptVariantLabel,
} from '../../lib/variant-links';

export default function VariantResume() {
  const draft = useStoredAreas().variantDraft.current;
  if (!draft) return null;
  const href = attemptVariantHref(draft);
  if (!href) return null;
  return (
    <p className="variant-resume">
      {draft.mode === 'training'
        ? 'Есть незавершённая тренировка'
        : 'Есть незавершённый экзамен'}
      : {attemptVariantLabel(draft)}.{' '}
      <a href={`${href}${href.includes('?') ? '&' : '?'}${draft.mode}=1`}>
        {draft.mode === 'training'
          ? 'Продолжить тренировку'
          : 'Продолжить экзамен'}
      </a>
      .{' '}
      {draft.mode === 'training'
        ? 'Без ограничения времени.'
        : 'Время продолжает идти.'}
    </p>
  );
}
