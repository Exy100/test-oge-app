import type { ClientDirective } from 'astro';

// Give text fonts and the readable page priority over the result module graph.
// A 200 ms deadline prevents a stalled font from delaying hydration indefinitely.
const afterPaint: ClientDirective = (load) => {
  let scheduled = false;
  const start = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void load().then((hydrate) => hydrate());
      });
    });
  };
  const afterText = () => {
    if (
      !PerformanceObserver.supportedEntryTypes.includes('paint') ||
      performance.getEntriesByName('first-contentful-paint', 'paint').length
    ) {
      start();
      return;
    }
    const observer = new PerformanceObserver((list) => {
      if (
        !list
          .getEntries()
          .some((entry) => entry.name === 'first-contentful-paint')
      )
        return;
      observer.disconnect();
      start();
    });
    observer.observe({ type: 'paint', buffered: true });
  };
  const deadline = window.setTimeout(afterText, 200);
  void document.fonts.ready.then(() => {
    window.clearTimeout(deadline);
    afterText();
  });
};
export default afterPaint;
