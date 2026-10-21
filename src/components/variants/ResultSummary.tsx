import type { VariantScore } from '../../core/scoring';

/** Shared between screen and print, including the provenance of the grade. */
export default function ResultSummary({ result }: { result: VariantScore }) {
  const shortScore = result.rows.reduce(
    (sum, row) => sum + (row.kind === 'short-answer' ? row.score : 0),
    0,
  );
  return (
    <div className="result-summary">
      <p>
        Краткие ответы №1–12: <strong>{shortScore} из 12</strong>.
      </p>
      {result.complete ? (
        <>
          <p>
            <strong>Первичный балл: {result.primaryScore} из 21.</strong>
          </p>
          <p>
            Ориентировочная отметка: <strong>{result.grade}</strong> (шкала{' '}
            {result.grading.year} года).
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>
              Результат неполный: {result.knownScore} учтено из 21.
            </strong>
          </p>
          <p>
            Не оценены работы №{result.pendingTaskNumbers.join(', ')}. Возможный
            итоговый балл: от {result.possibleScore.min} до{' '}
            {result.possibleScore.max}. Итоговая отметка пока не выставлена.
          </p>
        </>
      )}
      <p>
        Официальные баллы практической работы выставляют эксперты. Здесь баллы
        №13–16 основаны на сохранённых учебных оценках.
      </p>
      <p>{result.grading.notice}</p>
      <p>
        <a href={result.grading.source.url}>
          Источник шкалы: рекомендации {result.grading.year} года
        </a>
        , PDF, с. {result.grading.source.pages.join(', ')}, таблица{' '}
        {result.grading.source.table}. Формат заданий — проект{' '}
        {result.format.year} года.
      </p>
    </div>
  );
}
