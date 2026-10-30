import type { LocalStore } from '../../core/storage/store';

export const AI_POLICY = 'openrouter-feedback-v1';
export function hasAiConsent(store: LocalStore) {
  const consent = store.read('aiConsent');
  return consent.enabled && consent.policy === AI_POLICY;
}
export function grantAiConsent(store: LocalStore) {
  store.write('aiConsent', { version: 1, enabled: true, policy: AI_POLICY });
}
