import type { Areas } from '../core/storage/schemas';

export type AppearanceSettings = Areas['settings'];
export interface AppearanceSnapshot {
  settings: AppearanceSettings;
  messages: string[];
}
let latest: AppearanceSnapshot | null = null;
const listeners = new Set<(snapshot: AppearanceSnapshot) => void>();

/** A small bridge keeps static pages independent of storage validation code. */
export function publishAppearance(snapshot: AppearanceSnapshot) {
  latest = snapshot;
  for (const listener of listeners) listener(snapshot);
}
export function subscribeAppearance(
  listener: (snapshot: AppearanceSnapshot) => void,
) {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => {
    listeners.delete(listener);
  };
}
