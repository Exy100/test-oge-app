import { useId } from 'react';
import { useStoredAreas } from './useStoredAreas';
import { progressTotals } from '../core/stream/progress';
import { examConfig } from '../core/exam/exam.config';
import { sitePath } from '../lib/site';

const percent = (value: number | null) =>
  value === null ? 'Нет оценок' : `${String(Math.round(value * 100))}%`;
export default function StreamProgress({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { streamStats: stats, reviewQueue } = useStoredAreas();
  const totals = progressTotals(stats);
  const id = useId();
  return (
    <section className="stream-progress" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Твой прогресс</h2>
      <dl className="progress-totals">
        <div>
          <dt>Серия №1–12</dt>
          <dd className="progress-streak">{stats.streak}</dd>
        </div>
        <div>
          <dt>Точность №1–12</dt>
          <dd className="progress-accuracy">{percent(totals.accuracy)}</dd>
          <dd>
            Верно {totals.correct} из {totals.attempts}
          </dd>
        </div>
        <div>
          <dt>Самооценки №13–16</dt>
          <dd className="progress-self">{totals.self}</dd>
        </div>
        <div>
          <dt>Заданий в очереди повторения</dt>
          <dd className="progress-reviews">{reviewQueue.entries.length}</dd>
        </div>
      </dl>
      {totals.aiAccepted > 0 && (
        <p>
          Принятых оценок ИИ для практики: {totals.aiAccepted}. Они учитываются
          отдельно от автоматической проверки.
        </p>
      )}
      {totals.attempts === 0 &&
        totals.self === 0 &&
        totals.aiAccepted === 0 && (
          <p>
            Пока нет оценённых работ. Реши задание в потоке — результат появится
            здесь.
          </p>
        )}
      {!compact && (
        <>
          <p>
            Серия растёт за верные ответы №1–12 и прерывается ошибкой. Пропуски,
            ошибки формата и самооценки её не меняют.
          </p>
          <h3>Карта заданий №1–16</h3>
          <p>
            №1–12: доля верных ответов. №13–16: доля набранных баллов по
            самооценкам и принятым оценкам ИИ. Отсутствие оценки не считается
            ошибкой.
          </p>
          <ul className="progress-map">
            {Object.entries(examConfig.tasks).map(([number, rule]) => {
              const row = stats.entries.find(
                (entry) => entry.taskNumber === Number(number),
              );
              const automatic = Number(number) <= 12;
              const attempts = row
                ? automatic
                  ? row.attempts
                  : row.self.attempts + row.aiAccepted.attempts
                : 0;
              const credit = row
                ? automatic
                  ? row.correct
                  : row.self.credit + row.aiAccepted.credit
                : 0;
              const accuracy = attempts ? credit / attempts : null;
              const rounded =
                accuracy === null ? null : Math.round(accuracy * 100);
              const level =
                rounded === null
                  ? 'empty'
                  : rounded < 50
                    ? 'low'
                    : rounded < 80
                      ? 'medium'
                      : 'high';
              return (
                <li key={number} data-level={level}>
                  <a
                    href={sitePath(`/stream/?numbers=${number}`)}
                    aria-label={`№${number}: ${rule.skill}. ${percent(accuracy)}. ${String(attempts)} ${automatic ? 'ответов' : 'оценок практики'}`}
                  >
                    <strong>№{number}</strong>
                    <span>{percent(accuracy)}</span>
                    <small>
                      {automatic ? 'Ответы' : 'Оценки практики'}: {attempts}
                    </small>
                  </a>
                </li>
              );
            })}
          </ul>
          <p>
            Цвет карты: меньше 50%, от 50% до 79%, от 80%. Это результаты
            тренировки, не прогноз экзаменационного балла.
          </p>
        </>
      )}
      <p>
        Прогресс хранится в этом браузере.{' '}
        <a href={sitePath('/settings/')}>Экспорт и сброс — в настройках.</a>
      </p>
      {compact && (
        <a className="button button-dark" href={sitePath('/stream/')}>
          Продолжить тренировку →
        </a>
      )}
    </section>
  );
}
