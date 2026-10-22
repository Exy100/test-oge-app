export interface InteractiveRuntime {
  /** Visible in the viewport and in the foreground; manual pause is applied by the host. */
  active: boolean;
  /** The system or the site's animation setting requests a still presentation. */
  reducedMotion: boolean;
}

/** Each mount owns its observers and listeners, including changes in another tab. */
export function observeInteractiveRuntime(
  element: HTMLElement,
  notify: (runtime: InteractiveRuntime) => void,
): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let disposed = false;
  let previous: InteractiveRuntime | undefined;
  function update() {
    if (disposed) return;
    const next = {
      active: visible && document.visibilityState !== 'hidden',
      reducedMotion:
        media.matches || document.documentElement.dataset.animations === 'off',
    };
    if (
      next.active !== previous?.active ||
      next.reducedMotion !== previous.reducedMotion
    ) {
      previous = next;
      notify(next);
    }
  }
  const intersection = new IntersectionObserver((entries) => {
    const entry = entries.find((entry) => entry.target === element);
    if (entry) {
      visible = entry.isIntersecting && entry.intersectionRatio > 0;
      update();
    }
  });
  const preferences = new MutationObserver(update);
  intersection.observe(element);
  preferences.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-animations'],
  });
  media.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
    disposed = true;
    intersection.disconnect();
    preferences.disconnect();
    media.removeEventListener('change', update);
    document.removeEventListener('visibilitychange', update);
  };
}
