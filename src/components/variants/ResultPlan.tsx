import { examConfig } from '../../core/exam/exam.config';
import type { VariantScore } from '../../core/scoring';
import { sitePath } from '../../lib/site';
import { preparationLessons } from '../../lib/lessons/preparation';

export default function ResultPlan({
  result,
  variant13,
}: {
  result: VariantScore;
  variant13: 'presentation' | 'document';
}) {
  const weaker = result.rows.filter(
    (row) => row.score === null || row.score < row.maxScore,
  );
  return (
    <section className="result-plan" aria-label="План подготовки">
      <h3>План подготовки</h3>
      {weaker.length ? (
        <ol>
          {weaker.map((row) => (
            <li key={row.taskId}>
              <a
                href={`${sitePath('/stream/')}?${new URLSearchParams({ numbers: String(row.taskNumber), variant13 })}`}
              >
                №{row.taskNumber}: {examConfig.tasks[row.taskNumber].skill}
              </a>
              {row.score === null
                ? ' — сначала сравни свою работу с критериями в разборе, затем потренируйся.'
                : ` — результат ${String(row.score)}/${String(row.maxScore)}; прочитай решение и реши несколько новых задач.`}
              {preparationLessons.some(
                (lesson) => lesson.taskNumber === row.taskNumber,
              ) && (
                <ul aria-label={`Уроки к №${String(row.taskNumber)}`}>
                  {preparationLessons
                    .filter((lesson) => lesson.taskNumber === row.taskNumber)
                    .map((lesson) => (
                      <li key={lesson.id}>
                        <a href={sitePath(lesson.route)}>{lesson.title}</a>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>
          Все задания оценены на максимум. Закрепи результат на{' '}
          <a href={sitePath('/variants/')}>другом варианте</a>.
        </p>
      )}
    </section>
  );
}
