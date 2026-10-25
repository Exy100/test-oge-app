import { useStoredAreas } from '../useStoredAreas';
import { useHydrated } from '../useHydrated';
import { browserStore } from '../../core/storage/browser';
import { setLessonCompleted } from '../../lib/lessons/progress';
import { useState } from 'react';

export default function LessonCompletion({ lessonId }: { lessonId: string }) {
  const { lessonProgress } = useStoredAreas();
  const ready = useHydrated();
  const [error, setError] = useState('');
  const completed = lessonProgress.entries.some(
    (entry) => entry.lessonId === lessonId && entry.completed,
  );
  return (
    <div className="lesson-completion">
      <button
        type="button"
        className="button"
        disabled={!ready}
        aria-pressed={completed}
        onClick={() => {
          try {
            setLessonCompleted(browserStore(), lessonId, !completed);
            setError('');
          } catch {
            setError(
              'Не удалось сохранить отметку. Проверь сохранённые данные в настройках; перед сбросом их можно экспортировать.',
            );
          }
        }}
      >
        Урок пройден
      </button>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {completed
          ? 'Отметка сохранена. Можно снять её и вернуться к уроку.'
          : 'Отметь урок, когда разберёшься с темой и поработаешь с примерами.'}
      </p>
    </div>
  );
}
