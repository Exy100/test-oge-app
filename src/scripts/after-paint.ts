import type { ClientDirective } from 'astro';

// Give text fonts and the readable page priority over the result module graph.
// A 200 ms deadline prevents a stalled font from delaying hydration indefinitely.
const afterPaint: ClientDirective = (load) => {
  let scheduled = false;
  let waitingForPaint = false;
  const start = () => {
    if (scheduled) return;
    scheduled = true;
    let imported = false;
    const importAndHydrate = () => {
      if (imported) return;
      imported = true;
      window.clearTimeout(frameDeadline);
      void load().then((hydrate) => hydrate());
    };
    // A stalled rendering opportunity must not prevent loading the result UI.
    const frameDeadline = window.setTimeout(importAndHydrate, 200);
    requestAnimationFrame(() => {
      requestAnimationFrame(importAndHydrate);
    });
  };
  const afterText = () => {
    if (scheduled || waitingForPaint) return;
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
      window.clearTimeout(paintDeadline);
      observer.disconnect();
      start();
    });
    // WebKit can withhold Paint Timing while a font request is stalled.
    const paintDeadline = window.setTimeout(() => {
      observer.disconnect();
      start();
    }, 200);
    waitingForPaint = true;
    observer.observe({ type: 'paint', buffered: true });
  };
  const deadline = window.setTimeout(afterText, 200);
  void document.fonts.ready.then(() => {
    window.clearTimeout(deadline);
    afterText();
  });
};
export default afterPaint;
