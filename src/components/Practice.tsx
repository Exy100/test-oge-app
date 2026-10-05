import { useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import {
  checkPracticeAnswer,
  makePracticeTask,
  practiceSize,
  practiceTopics,
} from '../lib/practice';
import type { PracticeTopic } from '../lib/practice';

export default function Practice() {
  const [ready, setReady] = useState(false);
  const [topic, setTopic] = useState<PracticeTopic>('volume');
  const [indices, setIndices] = useState<Record<PracticeTopic, number>>({
    volume: 0,
    logic: 0,
    binary: 0,
  });
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<
    'invalid' | 'correct' | 'incorrect' | null
  >(null);
  const [hintCount, setHintCount] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [solved, setSolved] = useState<Set<string>>(() => new Set());
  const answerInput = useRef<HTMLInputElement>(null);
  const task = makePracticeTask(topic, indices[topic]);
  const currentTopic = practiceTopics.find((item) => item.id === topic);
  useEffect(() => {
    setReady(true);
  }, []);

  function resetAnswer() {
    setAnswer('');
    setFeedback(null);
    setHintCount(0);
    setShowSolution(false);
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = checkPracticeAnswer(task, answer);
    setFeedback(result);
    if (result === 'correct')
      setSolved((previous) => new Set([...previous, task.id]));
  }

  function nextTask() {
    setIndices((previous) => ({
      ...previous,
      [topic]: (previous[topic] + 1) % practiceSize(topic),
    }));
    resetAnswer();
    answerInput.current?.focus();
  }

  return (
    <div className="practice-layout">
      <div className="practice-sidebar">
        <fieldset className="topic-choices" disabled={!ready}>
          <legend>Выбери тему</legend>
          {practiceTopics.map((item) => (
            <label
              className={`topic-option ${topic === item.id ? 'is-active' : ''}`}
              key={item.id}
            >
              <input
                type="radio"
                name="practice-topic"
                value={item.id}
                checked={topic === item.id}
                onChange={() => {
                  setTopic(item.id);
                  resetAnswer();
                }}
              />
              <span className="topic-mark" aria-hidden="true">
                {item.mark}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>Тема №{item.number}</small>
              </span>
              <span className="topic-arrow" aria-hidden="true">
                →
              </span>
            </label>
          ))}
        </fieldset>
        <div className="session-note">
          <span className="session-dot" aria-hidden="true" />
          <div>
            <strong>
              Решено за занятие:{' '}
              <span data-testid="solved-count">{solved.size}</span>
            </strong>
            <p>Результат сохраняется до перезагрузки страницы.</p>
          </div>
        </div>
      </div>
      <div className="exercise-card" aria-busy={!ready}>
        <div className="exercise-topline">
          <span className="pill">{currentTopic?.title}</span>
          <span className="exercise-position">
            {indices[topic] + 1} / {practiceSize(topic)}
          </span>
        </div>
        <h3 id="exercise-heading">Разберём одну задачу</h3>
        <p className="exercise-question" data-testid="question">
          {task.question}
        </p>
        <form onSubmit={submit} aria-labelledby="exercise-heading" noValidate>
          <fieldset disabled={!ready} className="answer-fieldset">
            <label htmlFor="practice-answer">
              Твой ответ{topic === 'volume' ? ', в байтах' : ''}
            </label>
            <div className="answer-row">
              <input
                id="practice-answer"
                ref={answerInput}
                value={answer}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setFeedback(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                maxLength={32}
                aria-describedby="answer-guidance answer-feedback"
                aria-invalid={feedback === 'invalid'}
              />
              <button type="submit" className="button button-dark">
                Проверить <span aria-hidden="true">→</span>
              </button>
            </div>
            <p id="answer-guidance" className="input-guidance">
              Введи целое число. Enter — проверить.
            </p>
          </fieldset>
        </form>
        <div
          id="answer-feedback"
          role="status"
          className={`answer-feedback ${feedback ?? ''}`}
        >
          {feedback === 'correct' && (
            <p>
              <strong>Верно, получилось!</strong> Ответ: {task.answer}
              {topic === 'volume' ? ' байт' : ''}. Можно переходить дальше.
            </p>
          )}
          {feedback === 'incorrect' && (
            <p>
              <strong>Пока не совпало.</strong> Попробуй ещё раз или открой
              подсказку.
            </p>
          )}
          {feedback === 'invalid' && (
            <p>Введи целое число без букв и дробной части.</p>
          )}
        </div>
        <div className="exercise-tools">
          <button
            type="button"
            className="text-button"
            disabled={!ready || hintCount === task.hints.length}
            onClick={() => {
              setHintCount((count) => count + 1);
            }}
            aria-controls="practice-hints"
            aria-expanded={hintCount > 0}
          >
            {hintCount === 0
              ? 'Подсказка'
              : hintCount < 3
                ? `Ещё подсказка (${String(hintCount)}/3)`
                : 'Все подсказки открыты'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!ready}
            onClick={() => {
              setShowSolution((shown) => !shown);
            }}
            aria-controls="practice-solution"
            aria-expanded={showSolution}
          >
            {showSolution ? 'Скрыть решение' : 'Показать решение'}
          </button>
        </div>
        <div id="practice-hints" className="hints" hidden={hintCount === 0}>
          <ol>
            {task.hints.slice(0, hintCount).map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ol>
        </div>
        <div id="practice-solution" className="solution" hidden={!showSolution}>
          <h4>Решение по шагам</h4>
          <ol>
            {task.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="exercise-bottom">
          <span>Ошибаться — часть учёбы.</span>
          <button
            type="button"
            className="button button-light"
            disabled={!ready}
            onClick={nextTask}
          >
            Следующая задача <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
