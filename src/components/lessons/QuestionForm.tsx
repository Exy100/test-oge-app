import { useState } from 'react';
import {
  checkLessonQuestion,
  type LessonQuestion,
} from '../../lib/lessons/quiz';
import { useHydrated } from '../useHydrated';
import RichTextView from '../RichTextView';
import Figure from '../Figure';

export default function QuestionForm({
  id,
  title,
  question,
}: {
  id: string;
  title: string;
  question: LessonQuestion;
}) {
  const ready = useHydrated();
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<ReturnType<
    typeof checkLessonQuestion
  > | null>(null);
  const feedback = `${id}-feedback`;
  const answer = question.kind === 'short' ? question.answer : null;
  const format = !answer
    ? ''
    : answer.type === 'integer'
      ? 'Целое число без единиц измерения.'
      : answer.type === 'word'
        ? `Слово или текст по условию. ${answer.caseSensitive ? 'Регистр важен.' : 'Регистр не важен.'}`
        : `Последовательность: ${{ digits: 'цифры', latin: 'латинские буквы', cyrillic: 'русские буквы' }[answer.alphabet]}, без разделителей. ${answer.caseSensitive ? 'Регистр важен.' : 'Регистр не важен.'}`;
  function edit(value: string) {
    setRaw(value);
    setResult(null);
  }
  return (
    <article
      className="lesson-question"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`}>{title}</h3>
      {question.kind === 'short' ? (
        <>
          <RichTextView html={question.statementHtml} />
          {question.figure && (
            <Figure
              spec={question.figure}
              label={`Схема к вопросу: ${title}`}
            />
          )}
        </>
      ) : (
        <p>{question.prompt}</p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setResult(checkLessonQuestion(question, raw));
        }}
      >
        {question.kind === 'short' ? (
          <>
            <label htmlFor={`${id}-answer`}>Твой ответ</label>
            <p id={`${id}-format`}>{format}</p>
            <input
              id={`${id}-answer`}
              value={raw}
              type="text"
              maxLength={1000}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              aria-describedby={`${id}-format ${feedback}`}
              aria-invalid={result?.verdict === 'format_error'}
              onChange={(event) => {
                edit(event.target.value);
              }}
            />
          </>
        ) : (
          <fieldset aria-describedby={feedback}>
            <legend>Выбери ответ</legend>
            {question.options.map((option) => (
              <label className="lesson-choice" key={option.id}>
                <input
                  type="radio"
                  name={`${id}-answer`}
                  value={option.id}
                  checked={raw === option.id}
                  onChange={() => {
                    edit(option.id);
                  }}
                />
                <span>{option.text}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" className="button button-dark" disabled={!ready}>
          Проверить ответ
        </button>
        <div
          id={feedback}
          role="status"
          className="lesson-feedback"
          data-verdict={result?.verdict}
        >
          {result && (
            <>
              <p>
                {result.verdict === 'format_error'
                  ? result.message
                  : result.verdict === 'correct'
                    ? 'Верно! Попробуй следующий вопрос.'
                    : 'Пока неверно. Можно исправить ответ и проверить ещё раз.'}
              </p>
              {result.verdict !== 'format_error' &&
                ('message' in result ? (
                  <p>{result.message}</p>
                ) : result.verdict === 'incorrect' && result.explanation ? (
                  <p>{result.explanation}</p>
                ) : null)}
              {'notices' in result &&
                result.notices.map((notice) => (
                  <p key={notice.code}>{notice.message}</p>
                ))}
            </>
          )}
        </div>
      </form>
    </article>
  );
}
