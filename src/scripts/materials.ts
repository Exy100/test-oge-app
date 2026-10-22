import { browserStore } from '../core/storage/browser';
import {
  materialSections,
  matchesNumbers,
  readMaterialFilter,
  writeMaterialFilter,
} from '../lib/lessons/catalog';
import { lessonCompletion, sectionAttempts } from '../lib/lessons/progress';

function text(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

/** The catalog is HTML first; only filtering and local counters need client code. */
function connectCatalog(root: HTMLElement) {
  const store = browserStore();
  const checkboxes = [
    ...root.querySelectorAll<HTMLInputElement>('[data-material-number]'),
  ];
  const reset = root.querySelector<HTMLButtonElement>('[data-material-reset]');
  const topics = [
    ...root.querySelectorAll<HTMLElement>('[data-material-section]'),
  ];
  const lessons = [
    ...root.querySelectorAll<HTMLElement>('[data-material-lesson]'),
  ];
  function update() {
    const { numbers, invalid } = readMaterialFilter(window.location.search);
    const progress = store.read('lessonProgress');
    const stats = store.read('streamStats');
    for (const checkbox of checkboxes) {
      checkbox.disabled = false;
      checkbox.checked = numbers.includes(Number(checkbox.value));
    }
    if (reset) reset.disabled = numbers.length === 0 && !invalid;
    const error = root.querySelector<HTMLElement>('[data-material-error]');
    if (error) error.hidden = !invalid;
    for (const lesson of lessons) {
      lesson.hidden = !matchesNumbers(
        (lesson.dataset.numbers ?? '').split(',').map(Number),
        numbers,
      );
      const completed = progress.entries.some(
        (entry) =>
          entry.lessonId === lesson.dataset.materialLesson && entry.completed,
      );
      text(
        lesson.querySelector('[data-material-lesson-state]'),
        `${lesson.dataset.minutes ?? ''} мин · ${completed ? 'Пройден' : 'Не отмечен'}`,
      );
    }
    const visible = new Set<string>();
    for (const topic of topics) {
      const section = materialSections.find(
        (item) => item.id === topic.dataset.materialSection,
      );
      if (!section) continue;
      const visibleLesson = [
        ...topic.querySelectorAll<HTMLElement>('[data-material-lesson]'),
      ].some((lesson) => !lesson.hidden);
      topic.hidden =
        !matchesNumbers(section.numbers, numbers) && !visibleLesson;
      if (!topic.hidden) visible.add(section.id);
      const attempts = sectionAttempts(section.numbers, stats);
      const automatic = topic.querySelector<HTMLElement>(
        '[data-material-automatic]',
      );
      if (automatic) {
        automatic.hidden = attempts.attempts === 0;
        text(
          automatic,
          `Краткие ответы: верно ${String(attempts.correct)} из ${String(attempts.attempts)}.`,
        );
      }
      const assessment = topic.querySelector<HTMLElement>(
        '[data-material-assessment]',
      );
      if (assessment) {
        assessment.hidden = attempts.self === 0 && attempts.aiAccepted === 0;
        text(
          assessment,
          `Твоих оценок практической работы: ${String(attempts.self)}.${attempts.aiAccepted > 0 ? ` Принятых оценок ИИ: ${String(attempts.aiAccepted)}.` : ''}`,
        );
      }
    }
    for (const group of root.querySelectorAll<HTMLElement>('.materials-group'))
      group.hidden = ![
        ...group.querySelectorAll<HTMLElement>('[data-material-section]'),
      ].some((topic) => !topic.hidden);
    for (const node of root.querySelectorAll('[data-material-node]'))
      node.setAttribute(
        'data-selected',
        String(visible.has(node.getAttribute('data-material-node') ?? '')),
      );
    text(
      root.querySelector('.materials-count'),
      `Разделов в списке: ${String(visible.size)} из ${String(materialSections.length)}.`,
    );
    const completion = lessonCompletion(
      lessons
        .filter((lesson) => !lesson.hidden)
        .map((lesson) => lesson.dataset.materialLesson ?? ''),
      progress,
    );
    const summary = root.querySelector<HTMLElement>('.materials-completed');
    if (summary) {
      summary.hidden = completion.total === 0;
      text(
        summary,
        `Пройдено уроков в этом списке: ${String(completion.completed)} из ${String(completion.total)}. Это твои отметки о прохождении.`,
      );
    }
  }
  function select(numbers: readonly number[]) {
    const url = new URL(window.location.href);
    url.search = writeMaterialFilter(url.search, numbers);
    url.hash = '';
    window.history.pushState(null, '', url);
    update();
  }
  root.addEventListener('change', (event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.hasAttribute('data-material-number')
    )
      select(
        checkboxes
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => Number(checkbox.value)),
      );
  });
  reset?.addEventListener('click', () => {
    select([]);
  });
  // A static document owns this controller; the shared store handles storage and BFCache refresh.
  store.subscribe(update);
  window.addEventListener('popstate', update);
  update();
}

for (const root of document.querySelectorAll<HTMLElement>('.materials-catalog'))
  connectCatalog(root);
