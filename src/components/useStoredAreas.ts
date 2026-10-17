import { useSyncExternalStore } from 'react';
import { browserStore } from '../core/storage/browser';
import { defaults, type Areas } from '../core/storage/schemas';

const initial = defaults();
let cached: { revision: number; data: Areas } | undefined;
function snapshot() {
  const store = browserStore();
  if (cached?.revision !== store.revision)
    cached = { revision: store.revision, data: store.snapshot() };
  return cached.data;
}
function subscribe(onChange: () => void) {
  return browserStore().subscribe(onChange);
}
export function useStoredAreas() {
  return useSyncExternalStore(subscribe, snapshot, () => initial);
}
