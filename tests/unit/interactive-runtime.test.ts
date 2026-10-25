import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeInteractiveRuntime } from '../../src/lib/interactives/runtime';
import { loadInteractive } from '../../src/lib/interactives/module';
import { importFreshModule } from '../../src/lib/fresh-module';

vi.mock('../../src/lib/fresh-module', () => ({ importFreshModule: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('interactive runtime', () => {
  function environment() {
    const root = { dataset: { animations: 'on' } };
    const doc = Object.assign(new EventTarget(), {
      documentElement: root,
      visibilityState: 'visible',
    });
    const media = Object.assign(new EventTarget(), { matches: false });
    let intersection: IntersectionObserverCallback;
    let preferences: MutationCallback;
    const disconnectIntersection = vi.fn();
    const disconnectPreferences = vi.fn();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { matchMedia: () => media });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersection = callback;
        }
        observe = vi.fn();
        disconnect = disconnectIntersection;
      },
    );
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: MutationCallback) {
          preferences = callback;
        }
        observe = vi.fn();
        disconnect = disconnectPreferences;
      },
    );
    const element = {} as HTMLElement;
    const notify = vi.fn();
    const dispose = observeInteractiveRuntime(element, notify);
    return {
      doc,
      media,
      root,
      notify,
      dispose,
      disconnectIntersection,
      disconnectPreferences,
      visible(value: boolean) {
        intersection(
          [
            {
              target: element,
              isIntersecting: value,
              intersectionRatio: value ? 1 : 0,
              time: 0,
              rootBounds: null,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRect: {} as DOMRectReadOnly,
            },
          ],
          {} as IntersectionObserver,
        );
      },
      preferences() {
        preferences([], {} as MutationObserver);
      },
    };
  }

  it('starts paused, pauses outside the viewport and resumes in view', () => {
    const env = environment();
    expect(env.notify).toHaveBeenLastCalledWith({
      active: false,
      reducedMotion: false,
    });
    env.visible(true);
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: false,
    });
    env.visible(false);
    expect(env.notify).toHaveBeenLastCalledWith({
      active: false,
      reducedMotion: false,
    });
    env.visible(true);
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: false,
    });
  });

  it('foreground visibility cannot override an offscreen pause', () => {
    const env = environment();
    env.visible(true);
    env.doc.visibilityState = 'hidden';
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.notify).toHaveBeenLastCalledWith({
      active: false,
      reducedMotion: false,
    });
    env.visible(false);
    env.doc.visibilityState = 'visible';
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.notify).toHaveBeenLastCalledWith({
      active: false,
      reducedMotion: false,
    });
    env.visible(true);
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: false,
    });
  });

  it('either system preference or site preference disables motion without disabling manual controls', () => {
    const env = environment();
    env.visible(true);
    env.media.matches = true;
    env.media.dispatchEvent(new Event('change'));
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: true,
    });
    env.root.dataset.animations = 'off';
    env.preferences();
    env.media.matches = false;
    env.media.dispatchEvent(new Event('change'));
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: true,
    });
    env.root.dataset.animations = 'on';
    env.preferences();
    expect(env.notify).toHaveBeenLastCalledWith({
      active: true,
      reducedMotion: false,
    });
  });

  it('disposes observers and native listeners, so later external events do not notify', () => {
    const env = environment();
    env.dispose();
    expect(env.disconnectIntersection).toHaveBeenCalledOnce();
    expect(env.disconnectPreferences).toHaveBeenCalledOnce();
    env.notify.mockClear();
    env.media.matches = true;
    env.media.dispatchEvent(new Event('change'));
    env.doc.visibilityState = 'hidden';
    env.doc.dispatchEvent(new Event('visibilitychange'));
    env.visible(true);
    env.preferences();
    expect(env.notify).not.toHaveBeenCalled();
  });
});

describe('interactive module loading', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://example.test/test-oge-app/',
        origin: 'https://example.test',
      },
    });
  });

  it.each([
    'https://elsewhere.test/scene.js',
    'javascript:alert(1)',
    'data:text/javascript,export default 1',
  ])('rejects a foreign or non-HTTP module: %s', async (entry) => {
    await expect(loadInteractive(entry)).rejects.toThrow('на этом сайте');
    expect(importFreshModule).not.toHaveBeenCalled();
  });

  it.each([null, {}, { default: null }, { default: 'component' }])(
    'rejects an invalid export: %j',
    async (value) => {
      vi.mocked(importFreshModule).mockResolvedValueOnce(value);
      await expect(loadInteractive('/test-oge-app/scene.js')).rejects.toThrow(
        'экспортировать компонент',
      );
    },
  );

  it('accepts a same-site component and preserves the Pages base in its URL', async () => {
    function Scene() {
      return 'Сцена';
    }
    vi.mocked(importFreshModule).mockResolvedValueOnce({ default: Scene });
    const loaded = await loadInteractive('./scene.js');
    expect(loaded.default).toBe(Scene);
    expect(importFreshModule).toHaveBeenCalledWith(
      'https://example.test/test-oge-app/scene.js',
    );
  });

  it('shares a successful module across concurrent and subsequent mounts', async () => {
    const module = { default: () => 'Сцена' };
    vi.mocked(importFreshModule).mockResolvedValueOnce(module);
    const entries = await Promise.all([
      loadInteractive('./shared.js'),
      loadInteractive('./shared.js'),
    ]);
    expect(entries).toEqual([module, module]);
    expect(await loadInteractive('./shared.js')).toBe(module);
    expect(importFreshModule).toHaveBeenCalledOnce();
  });

  it('does not retain a failed request, allowing a real retry', async () => {
    const module = { default: () => 'Сцена' };
    vi.mocked(importFreshModule)
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(module);
    await expect(loadInteractive('./retry.js')).rejects.toThrow(
      'Network failure',
    );
    expect(await loadInteractive('./retry.js')).toBe(module);
    expect(importFreshModule).toHaveBeenCalledTimes(2);
  });
});
