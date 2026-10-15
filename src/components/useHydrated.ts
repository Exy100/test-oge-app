import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** False in server HTML and during hydration; true once the island can respond. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
