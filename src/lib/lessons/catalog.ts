import type { LessonMetadata } from './schema';
import { lessonStreamHref } from './links';

export const materialSections = [
  {
    id: 'i1',
    title: 'Информация и объём',
    lines: ['Информация', 'и объём'],
    numbers: [1],
    prerequisites: [],
    column: 0,
    row: 0,
    computer: false,
  },
  {
    id: 'i2',
    title: 'Кодирование',
    lines: ['Кодирование'],
    numbers: [2],
    prerequisites: ['i1'],
    column: 0,
    row: 1,
    computer: false,
  },
  {
    id: 'i3',
    title: 'Логика',
    lines: ['Логика'],
    numbers: [3],
    prerequisites: [],
    column: 1,
    row: 0,
    computer: false,
  },
  {
    id: 'i4',
    title: 'Графы и схемы',
    lines: ['Графы и схемы'],
    numbers: [4, 9],
    prerequisites: [],
    column: 2,
    row: 0,
    computer: false,
  },
  {
    id: 'i5',
    title: 'Исполнители',
    lines: ['Исполнители'],
    numbers: [5],
    prerequisites: [],
    column: 3,
    row: 0,
    computer: false,
  },
  {
    id: 'i6',
    title: 'Чтение программ',
    lines: ['Чтение программ'],
    numbers: [6],
    prerequisites: ['i3', 'i5'],
    column: 3,
    row: 1,
    computer: false,
  },
  {
    id: 'i7',
    title: 'Сети и адреса',
    lines: ['Сети и адреса'],
    numbers: [7],
    prerequisites: [],
    column: 4,
    row: 0,
    computer: false,
  },
  {
    id: 'i8',
    title: 'Поиск и множества',
    lines: ['Поиск', 'и множества'],
    numbers: [8],
    prerequisites: ['i3'],
    column: 1,
    row: 1,
    computer: false,
  },
  {
    id: 'i9',
    title: 'Системы счисления',
    lines: ['Системы', 'счисления'],
    numbers: [10],
    prerequisites: ['i1'],
    column: 2,
    row: 1,
    computer: false,
  },
  {
    id: 'i10',
    title: 'Файлы и поиск',
    lines: ['Файлы и поиск'],
    numbers: [11, 12],
    prerequisites: [],
    column: 5,
    row: 0,
    computer: true,
  },
  {
    id: 'i11',
    title: 'Документы и презентации',
    lines: ['Документы', 'и презентации'],
    numbers: [13],
    prerequisites: ['i10'],
    column: 4,
    row: 1,
    computer: true,
  },
  {
    id: 'i12',
    title: 'Электронные таблицы',
    lines: ['Электронные', 'таблицы'],
    numbers: [14],
    prerequisites: ['i3', 'i10'],
    column: 5,
    row: 1,
    computer: true,
  },
  {
    id: 'i13',
    title: 'Робот',
    lines: ['Робот'],
    numbers: [15],
    prerequisites: ['i3', 'i5'],
    column: 3,
    row: 2,
    computer: true,
  },
  {
    id: 'i14',
    title: 'Программирование',
    lines: ['Программирование'],
    numbers: [16],
    prerequisites: ['i6'],
    column: 4,
    row: 2,
    computer: true,
  },
] as const;

export type MaterialSection = (typeof materialSections)[number];
export interface CatalogLesson extends LessonMetadata {
  route: string;
}

export function sectionHref(id: string) {
  if (!materialSections.some((section) => section.id === id))
    throw new TypeError('Неизвестный раздел материалов.');
  return `/materials/#${id}`;
}

export function lessonRoute(lesson: Pick<LessonMetadata, 'id' | 'section'>) {
  return `/materials/${encodeURIComponent(lesson.section)}/${encodeURIComponent(lesson.id)}/`;
}

/** Prerequisites precede their dependents, even when their titles sort later. */
export function lessonCatalog(
  metadata: readonly LessonMetadata[],
): CatalogLesson[] {
  const lessons = new Map(metadata.map((lesson) => [lesson.id, lesson]));
  if (lessons.size !== metadata.length) throw new TypeError('Повтор id урока.');
  const active = new Set<string>();
  const completed = new Set<string>();
  const result: CatalogLesson[] = [];
  function visit(id: string) {
    if (completed.has(id)) return;
    if (active.has(id)) throw new TypeError('Цикл пререквизитов урока: ' + id);
    const lesson = lessons.get(id);
    if (!lesson) throw new TypeError('Не найден пререквизит: ' + id);
    if (id.trim().length === 0 || id.length > 200 || id === '.' || id === '..')
      throw new TypeError(
        'Для урока нужен id длиной 1–200 символов без точечных сегментов.',
      );
    if (!materialSections.some((section) => section.id === lesson.section))
      throw new TypeError('Неизвестный раздел урока.');
    active.add(id);
    for (const prerequisite of lesson.prerequisites) visit(prerequisite);
    active.delete(id);
    completed.add(id);
    result.push({ ...lesson, route: lessonRoute(lesson) });
  }
  for (const lesson of [...metadata].sort((a, b) =>
    a.title.localeCompare(b.title, 'ru'),
  ))
    visit(lesson.id);
  return result;
}

export function matchesNumbers(
  numbers: readonly number[],
  selected: readonly number[],
) {
  return (
    selected.length === 0 || numbers.some((number) => selected.includes(number))
  );
}

export function readMaterialFilter(search: string): {
  numbers: number[];
  invalid: boolean;
} {
  const params = new URLSearchParams(search);
  const raw = params.get('numbers');
  if (
    search.length > 8192 ||
    params.getAll('numbers').length > 1 ||
    (raw !== null && !/^(?:[1-9]|1[0-6])(?:,(?:[1-9]|1[0-6]))*$/u.test(raw))
  )
    return { numbers: [], invalid: true };
  return {
    numbers:
      raw === null
        ? []
        : [...new Set(raw.split(',').map(Number))].sort((a, b) => a - b),
    invalid: false,
  };
}

export function writeMaterialFilter(
  search: string,
  selected: readonly number[],
) {
  if (
    selected.some(
      (number) => !Number.isInteger(number) || number < 1 || number > 16,
    )
  )
    throw new TypeError('Нужны номера 1–16.');
  const params = new URLSearchParams(search);
  params.delete('numbers');
  if (selected.length)
    params.set(
      'numbers',
      [...new Set(selected)].sort((a, b) => a - b).join(','),
    );
  const query = params.toString();
  return query ? '?' + query : '';
}

export function sectionPractice(section: MaterialSection) {
  return section.id === 'i11'
    ? [
        {
          title: 'Презентация · №13.1',
          href: lessonStreamHref([13], 'presentation'),
        },
        { title: 'Документ · №13.2', href: lessonStreamHref([13], 'document') },
      ]
    : [
        {
          title: `Практика · №${section.numbers.join(', №')}`,
          href: lessonStreamHref(section.numbers),
        },
      ];
}
