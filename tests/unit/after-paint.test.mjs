import { afterEach, expect, test, vi } from 'vitest';
import afterPaint from '../../src/scripts/after-paint.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('hydrates once even when font, paint and frame delivery stall', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const fonts = Promise.withResolvers();
  const frames = [];
  const hydrate = vi.fn().mockResolvedValue(undefined);
  const load = vi.fn().mockResolvedValue(hydrate);
  class PaintObserver {
    static supportedEntryTypes = ['paint'];
    observe = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { fonts: { ready: fonts.promise } });
  vi.stubGlobal('performance', { getEntriesByName: () => [] });
  vi.stubGlobal('PerformanceObserver', PaintObserver);
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.push(callback);
    return frames.length;
  });

  afterPaint(load);
  await vi.advanceTimersByTimeAsync(1000);
  expect(load).toHaveBeenCalledTimes(1);
  expect(hydrate).toHaveBeenCalledTimes(1);

  // Delayed browser signals must not mount a second result or duplicate listeners.
  fonts.resolve();
  while (frames.length) frames.shift()(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(load).toHaveBeenCalledTimes(1);
  expect(hydrate).toHaveBeenCalledTimes(1);
});
