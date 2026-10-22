import { sitePath } from '../site.ts';

export interface LessonLink {
  id: string;
  title: string;
  route: string;
}
export function lessonStreamHref(
  numbers: readonly number[],
  variant13?: 'presentation' | 'document',
) {
  if (
    !numbers.length ||
    numbers.some(
      (number) => !Number.isInteger(number) || number < 1 || number > 16,
    )
  )
    throw new TypeError('Для практики нужны номера заданий 1–16.');
  const query = new URLSearchParams({
    numbers: [...new Set(numbers)].sort((a, b) => a - b).join(','),
  });
  if (variant13) query.set('variant13', variant13);
  return `${sitePath('/stream/')}?${query}`;
}
export function prerequisiteLinks(
  ids: readonly string[],
  lessons: readonly LessonLink[],
) {
  return ids.map((id) => {
    const lesson = lessons.find((lesson) => lesson.id === id);
    if (!lesson) throw new TypeError(`Не найден урок-пререквизит ${id}.`);
    return { ...lesson, href: sitePath(lesson.route) };
  });
}
