import { fixedVariants, VARIANT_VERSION } from '../core/variants/catalog';
import type { TaskInstance } from '../core/types';
import type { Areas } from '../core/storage/schemas';
import { sitePath } from './site';

export class VariantLinkError extends TypeError {}

export function fixedVariantHref(id: string): string {
  if (!fixedVariants.some((entry) => entry.id === id))
    throw new TypeError('Такого варианта нет в каталоге.');
  return sitePath(`/variants/${id}/`);
}
export function randomVariantHref(seed: string): string {
  if (seed.length > 200)
    throw new VariantLinkError('Ссылка на вариант слишком длинная.');
  return `${sitePath('/variants/random/')}?${new URLSearchParams({ seed })}`;
}
export function readVariantSeed(search: string): string {
  if (search.length > 8192)
    throw new VariantLinkError('Ссылка на вариант слишком длинная.');
  const values = new URLSearchParams(search).getAll('seed');
  if (values.length !== 1 || values[0] === undefined)
    throw new VariantLinkError(
      'Ссылка на вариант повреждена. Выбери случайный вариант в каталоге.',
    );
  if (values[0].length > 200)
    throw new VariantLinkError('Ссылка на вариант слишком длинная.');
  return values[0];
}
export function variantTaskHref(task: TaskInstance): string {
  return `${sitePath('/stream/')}?${new URLSearchParams({ task: task.generatorId, seed: task.seed })}`;
}
type Attempt = Areas['variantAttempts']['entries'][number];
/** Link only records whose stored identity can be reproduced by this catalogue. */
export function attemptVariantHref(
  attempt: Pick<Attempt, 'variantId' | 'seed'>,
): string | null {
  const fixed = fixedVariants.find((entry) => entry.id === attempt.variantId);
  if (fixed && fixed.seed === attempt.seed) return fixedVariantHref(fixed.id);
  if (attempt.variantId === `${VARIANT_VERSION}:${attempt.seed}`)
    return randomVariantHref(attempt.seed);
  return null;
}
export function attemptVariantLabel(
  attempt: Pick<Attempt, 'variantId' | 'seed'>,
): string {
  return attempt.variantId === `${VARIANT_VERSION}:${attempt.seed}`
    ? 'Случайный вариант'
    : `Вариант ${attempt.variantId}`;
}
