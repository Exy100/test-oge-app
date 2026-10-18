import { useStoredAreas } from '../useStoredAreas';
import {
  attemptVariantHref,
  attemptVariantLabel,
} from '../../lib/variant-links';

export default function VariantResume() {
  const draft = useStoredAreas().variantDraft.current;
  if (!draft || draft.mode !== 'exam') return null;
  const href = attemptVariantHref(draft);
  if (!href) return null;
  return (
    <p className="variant-resume">
      Есть незавершённый экзамен: {attemptVariantLabel(draft)}.{' '}
      <a href={`${href}${href.includes('?') ? '&' : '?'}exam=1`}>
        Продолжить экзамен
      </a>
      . Время продолжает идти.
    </p>
  );
}
