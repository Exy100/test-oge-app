import type { LocalStore } from '../../core/storage/store';

export const AI_POLICY = 'openrouter-feedback-v1';
export type AiMode = 'stream-feedback' | 'part2-grade' | 'variant-summary';
export function hasAiConsent(
  store: LocalStore,
  mode: AiMode = 'stream-feedback',
) {
  const consent = store.read('aiConsent');
  return (
    consent.enabled &&
    consent.policy === AI_POLICY &&
    (consent.modes ?? ['stream-feedback']).includes(mode)
  );
}
export function grantAiConsent(
  store: LocalStore,
  mode: AiMode = 'stream-feedback',
) {
  const previous = store.read('aiConsent');
  const modes =
    previous.enabled && previous.policy === AI_POLICY
      ? (previous.modes ?? ['stream-feedback' as const])
      : [];
  store.write('aiConsent', {
    version: 1,
    enabled: true,
    policy: AI_POLICY,
    modes: Array.from(new Set([...modes, mode])),
  });
}
