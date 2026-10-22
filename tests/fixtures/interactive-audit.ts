export interface InteractiveResources {
  listeners: number;
  intervals: number;
  frames: number;
  intersections: number;
  mutations: number;
}

declare global {
  interface Window {
    interactiveResources: () => InteractiveResources;
  }
}

/** Runs in the page. Count real native resources allocated by the host and its scene. */
export function installInteractiveAudit() {
  const owned = () =>
    /\/src\/(?:lib\/interactives\/|dev\/InteractiveProbe\.tsx)/u.test(
      new Error().stack ?? '',
    );
  const listeners = new Map<
    EventTarget,
    Map<string, Set<EventListenerOrEventListenerObject>>
  >();
  const add = Reflect.get(EventTarget.prototype, 'addEventListener');
  const remove = Reflect.get(EventTarget.prototype, 'removeEventListener');
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (callback && owned()) {
      let target = listeners.get(this);
      if (!target)
        listeners.set(
          this,
          (target = new Map<string, Set<EventListenerOrEventListenerObject>>()),
        );
      const key = `${type}:${String(typeof options === 'boolean' ? options : !!options?.capture)}`;
      let entries = target.get(key);
      if (!entries) target.set(key, (entries = new Set()));
      entries.add(callback);
    }
    add.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type,
    callback,
    options,
  ) {
    const key = `${type}:${String(typeof options === 'boolean' ? options : !!options?.capture)}`;
    if (callback) listeners.get(this)?.get(key)?.delete(callback);
    remove.call(this, type, callback, options);
  };

  const intervals = new Set<number>();
  const browserWindow: Window = window;
  const setInterval = browserWindow.setInterval.bind(browserWindow);
  const clearInterval = browserWindow.clearInterval.bind(browserWindow);
  browserWindow.setInterval = (
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => {
    const id = setInterval(handler, timeout, ...args);
    if (owned()) intervals.add(id);
    return id;
  };
  browserWindow.clearInterval = (id) => {
    if (id !== undefined) intervals.delete(id);
    clearInterval(id);
  };

  const frames = new Set<number>();
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const track = owned();
    const id = requestFrame((timestamp) => {
      frames.delete(id);
      callback(timestamp);
    });
    if (track) frames.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
    cancelFrame(id);
  };

  const intersections = new Set<IntersectionObserver>();
  const BaseIntersection = window.IntersectionObserver;
  window.IntersectionObserver = class extends BaseIntersection {
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      super(callback, options);
      if (owned()) intersections.add(this);
    }
    disconnect() {
      intersections.delete(this);
      super.disconnect();
    }
  };
  const mutations = new Set<MutationObserver>();
  const BaseMutation = window.MutationObserver;
  window.MutationObserver = class extends BaseMutation {
    constructor(callback: MutationCallback) {
      super(callback);
      if (owned()) mutations.add(this);
    }
    disconnect() {
      mutations.delete(this);
      super.disconnect();
    }
  };
  window.interactiveResources = () => ({
    listeners: [...listeners.values()].reduce(
      (sum, target) =>
        sum +
        [...target.values()].reduce((sum, entries) => sum + entries.size, 0),
      0,
    ),
    intervals: intervals.size,
    frames: frames.size,
    intersections: intersections.size,
    mutations: mutations.size,
  });
}
