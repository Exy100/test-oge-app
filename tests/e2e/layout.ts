import { expect, type Page } from '@playwright/test';

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const viewport = innerWidth;
    const documentWidth = document.documentElement.scrollWidth;
    return {
      viewport,
      document: documentWidth,
      offenders:
        documentWidth <= viewport
          ? []
          : Array.from(document.querySelectorAll<HTMLElement>('main *'))
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  style.overflowX === 'visible' &&
                  (element.scrollWidth > element.clientWidth ||
                    element.getBoundingClientRect().right > viewport)
                );
              })
              .slice(0, 30)
              .map((element) => ({
                tag: element.tagName,
                class: element.getAttribute('class'),
                width: element.getBoundingClientRect().width,
                right: element.getBoundingClientRect().right,
                scroll: element.scrollWidth,
                client: element.clientWidth,
                text: element.textContent.slice(0, 80),
              })),
    };
  });
  expect(layout.document, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport,
  );
}
