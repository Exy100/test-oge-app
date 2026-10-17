import { useId, useState } from 'react';
import { examConfig } from '../core/exam/exam.config';
import type { TaskNumber } from '../core/types';
import type { StreamFilters as Filters } from '../core/stream/filtered';

export default function StreamFilters({
  filters,
  topics,
  onApply,
}: {
  filters: Filters;
  topics: readonly string[];
  onApply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const id = useId();
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <fieldset>
          <legend>Номера заданий</legend>
          <div className="stream-numbers">
            {Object.entries(examConfig.tasks).map(([value, rule]) => {
              const number = Number(value) as TaskNumber;
              return (
                <label key={number} title={rule.skill}>
                  <input
                    type="checkbox"
                    checked={draft.numbers.includes(number)}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        numbers: event.target.checked
                          ? [...draft.numbers, number].sort((a, b) => a - b)
                          : draft.numbers.filter((item) => item !== number),
                      });
                    }}
                  />
                  №{number}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="stream-filter-fields">
          <div>
            <label htmlFor={`${id}-topic`}>Тема задания</label>
            <select
              id={`${id}-topic`}
              value={draft.topic}
              onChange={(event) => {
                setDraft({ ...draft, topic: event.target.value });
              }}
            >
              <option value="">Все темы</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-difficulty`}>Сложность задания</label>
            <select
              id={`${id}-difficulty`}
              value={draft.difficulty}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  difficulty: Number(
                    event.target.value,
                  ) as Filters['difficulty'],
                });
              }}
            >
              <option value="0">Любая сложность</option>
              <option value="1">1 из 3</option>
              <option value="2">2 из 3</option>
              <option value="3">3 из 3</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-variant`}>Вид работы №13</label>
            <select
              id={`${id}-variant`}
              value={draft.variant13}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  variant13: event.target.value as Filters['variant13'],
                });
              }}
            >
              <option value="presentation">Презентация</option>
              <option value="document">Текстовый документ</option>
            </select>
          </div>
        </div>
        <label className="stream-review">
          <input
            type="checkbox"
            checked={draft.reviewOnly}
            onChange={(event) => {
              setDraft({ ...draft, reviewOnly: event.target.checked });
            }}
          />
          Только повторение ошибок
        </label>
        <p>
          Повторы появляются после 3, 10 и 30 других заданий. Очередь хранится в
          этом браузере после перезагрузки.
        </p>
        {draft.numbers.length === 0 && (
          <p role="alert">Выбери хотя бы один номер.</p>
        )}
        <button
          className="button button-dark"
          type="submit"
          disabled={draft.numbers.length === 0}
        >
          Применить фильтры
        </button>
      </form>
    </>
  );
}
