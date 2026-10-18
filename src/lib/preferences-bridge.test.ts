import { expect, test } from 'vitest';
import {
  publishAppearance,
  subscribeAppearance,
  type AppearanceSnapshot,
} from './preferences-bridge';

test('late listeners receive current preferences, future changes and no changes after unsubscribe', () => {
  const snapshot: AppearanceSnapshot = {
    settings: { version: 1, theme: 'dark', fontSize: 125, animations: false },
    messages: ['Сохранение в памяти'],
  };
  publishAppearance(snapshot);
  const received: AppearanceSnapshot[] = [];
  const unsubscribe = subscribeAppearance((value) => {
    received.push(value);
  });
  expect(received).toEqual([snapshot]);
  const updated = {
    ...snapshot,
    settings: { ...snapshot.settings, fontSize: 150 as const },
  };
  publishAppearance(updated);
  expect(received).toEqual([snapshot, updated]);
  unsubscribe();
  publishAppearance(snapshot);
  expect(received).toEqual([snapshot, updated]);
});
