import type { Areas } from '../../core/storage/schemas';
import type { LocalStore } from '../../core/storage/store';

/** A manual completion mark never overwrites a quiz result or game levels. */
export function setLessonCompleted(
  store: LocalStore,
  lessonId: string,
  completed: boolean,
) {
  store.refresh();
  const progress = store.read('lessonProgress');
  const current = progress.entries.find((entry) => entry.lessonId === lessonId);
  const entry = {
    lessonId,
    quizCorrect: 0,
    quizTotal: 0,
    levels: [],
    ...current,
    completed,
  };
  store.write('lessonProgress', {
    ...progress,
    entries: [
      ...progress.entries.filter((row) => row.lessonId !== lessonId),
      entry,
    ],
  });
}

/** Saved entries for absent lessons cannot inflate the catalog's denominator or count. */
export function lessonCompletion(
  ids: readonly string[],
  progress: Areas['lessonProgress'],
) {
  const visible = new Set(ids);
  return {
    total: visible.size,
    completed: progress.entries.filter(
      (row) => visible.has(row.lessonId) && row.completed,
    ).length,
  };
}

export function sectionAttempts(
  numbers: readonly number[],
  stats: Areas['streamStats'],
) {
  const rows = stats.entries.filter((row) => numbers.includes(row.taskNumber));
  const automatic = rows.filter((row) => row.taskNumber <= 12);
  return {
    attempts: automatic.reduce((sum, row) => sum + row.attempts, 0),
    correct: automatic.reduce((sum, row) => sum + row.correct, 0),
    self: rows.reduce((sum, row) => sum + row.self.attempts, 0),
    aiAccepted: rows.reduce((sum, row) => sum + row.aiAccepted.attempts, 0),
  };
}
