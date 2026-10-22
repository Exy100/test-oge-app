import type { LessonMetadata } from '../lib/lessons/schema';
import type { LessonLink } from '../lib/lessons/links';

export const lesson: LessonMetadata = {
  id: 'component-gallery',
  title: 'Как читать условие и проверять решение',
  section: 'i1',
  taskNumbers: [1, 2, 3, 13],
  readingMinutes: 7,
  prerequisites: ['bits'],
};
export const links: LessonLink[] = [
  { id: 'bits', title: 'Единицы информации', route: '/dev/lessons/#theory' },
];
