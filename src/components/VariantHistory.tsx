import { useHydrated } from './useHydrated';
import { useStoredAreas } from './useStoredAreas';
import { attemptResultHref, attemptVariantLabel } from '../lib/variant-links';

export default function VariantHistory() {
  const ready = useHydrated();
  const { variantAttempts } = useStoredAreas();
  if (!ready) return <p>История попыток хранится в этом браузере.</p>;
  const rows = [...variantAttempts.entries].sort(
    (a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt),
  );
  if (!rows.length) return <p role="status">Сохранённых попыток пока нет.</p>;
  const date = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <>
      <p>
        Сохранённые результаты этого браузера. Баллы практических работ
        учитывают твою самооценку.
      </p>
      <div
        className="variant-history-scroll"
        role="region"
        aria-label="Таблица истории попыток"
        tabIndex={0}
      >
        <table className="variant-history-table">
          <thead>
            <tr>
              <th scope="col">Вариант</th>
              <th scope="col">Режим</th>
              <th scope="col">Завершён</th>
              <th scope="col">Результат</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((attempt) => {
              const href = attemptResultHref(attempt);
              const label = attemptVariantLabel(attempt);
              return (
                <tr key={attempt.id}>
                  <td>
                    {href ? <a href={href}>{label}</a> : label}
                    <span className="variant-history-kind">
                      Работа №
                      {attempt.variant13 === 'presentation' ? '13.1' : '13.2'}
                    </span>
                  </td>
                  <td>{attempt.mode === 'exam' ? 'Экзамен' : 'Тренировка'}</td>
                  <td>
                    <time dateTime={attempt.finishedAt}>
                      {date.format(new Date(attempt.finishedAt))}
                    </time>
                  </td>
                  <td>
                    {attempt.score === null || attempt.assessments.length < 4
                      ? 'Без итогового балла'
                      : `${String(attempt.score)} из 21`}
                    {attempt.score !== null &&
                      attempt.assessments.length < 4 && (
                        <span className="variant-history-kind">
                          Практика оценена не полностью
                        </span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
