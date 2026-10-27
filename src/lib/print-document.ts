interface PrintState {
  trigger: HTMLElement;
  marks: [HTMLElement, string][];
  opened: HTMLDetailsElement[];
}

let active: PrintState | null = null;
let listening = false;

function restore(focus = true) {
  if (!active) return;
  const previous = active;
  active = null;
  for (const details of previous.opened) details.open = false;
  for (const [element, attribute] of previous.marks)
    element.removeAttribute(attribute);
  if (focus && previous.trigger.isConnected)
    previous.trigger.focus({ preventScroll: true });
}

/** Keep the selected material in the live DOM, including its SVG/MathML IDs. */
export function printDocument({
  trigger,
  selection,
}: {
  trigger: HTMLElement;
  selection?: HTMLElement;
}): void {
  restore(false);
  if (!listening) {
    listening = true;
    const media = window.matchMedia('print');
    media.addEventListener('change', () => {
      if (!media.matches) restore();
    });
    window.addEventListener('afterprint', () => {
      if (!media.matches) restore();
    });
  }
  const state: PrintState = { trigger, marks: [], opened: [] };
  active = state;
  function mark(element: HTMLElement, attribute: string) {
    element.setAttribute(attribute, '');
    state.marks.push([element, attribute]);
  }
  if (selection) {
    mark(document.documentElement, 'data-print-selection');
    mark(selection, 'data-print-selected');
    const details = new Set(selection.querySelectorAll('details'));
    for (
      let parent = selection.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      mark(parent, 'data-print-path');
      if (parent instanceof HTMLDetailsElement) details.add(parent);
      if (parent === document.body) break;
    }
    const header = selection
      .closest('.lesson-page')
      ?.querySelector<HTMLElement>('.lesson-header');
    if (header) mark(header, 'data-print-keep');
    for (const item of details) {
      if (!item.open) {
        state.opened.push(item);
        item.open = true;
      }
    }
  }
  try {
    window.print();
  } catch (error) {
    restore();
    throw error;
  }
}
