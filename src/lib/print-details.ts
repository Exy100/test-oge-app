// WebKit does not expose closed native details through ::details-content.
// Open the real elements for printing and restore each screen state afterwards.
export {};

const media = window.matchMedia('print');
const closed = new Set<HTMLDetailsElement>();
let printing = false;

function expand() {
  if (printing) return;
  printing = true;
  for (const details of document.querySelectorAll<HTMLDetailsElement>(
    '.interactive-alternative, .lesson-cheatsheet, [data-lesson-example]',
  )) {
    if (!details.open) {
      closed.add(details);
      details.open = true;
    }
  }
}

function restore() {
  for (const details of closed) details.open = false;
  closed.clear();
  printing = false;
}

media.addEventListener('change', () => {
  if (media.matches) expand();
  else restore();
});
window.addEventListener('beforeprint', expand);
window.addEventListener('afterprint', restore);
if (media.matches) expand();
