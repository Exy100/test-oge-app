import { useRef, useState } from 'react';
import { bytes, quantity } from '../core/generators/task';
import {
  editSymbolExample,
  symbolExample,
  symbolExamples,
  symbolScenarios,
  symbolWords,
  type SymbolScenario,
} from '../lib/interactives/symbol-examples';
import {
  useInteractiveInterval,
  useInteractiveRuntime,
} from '../lib/interactives/hooks';
import '../styles/symbol-practice.css';
export default function SymbolPractice({
  scenario,
  variant,
  onNext,
}: {
  scenario: SymbolScenario;
  variant: number;
  onNext: () => void;
}) {
  const p = symbolExample(scenario, variant);
  const rule = symbolScenarios[scenario];
  const words = symbolWords(p.text);
  const [selected, setSelected] = useState<number | null>(null);
  const [space, setSpace] = useState(false);
  const [comma, setComma] = useState(false);
  const [solo, setSolo] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [tested, setTested] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const runtime = useInteractiveRuntime(stage);
  const token = words.find((w) => w.start === selected);
  const edit =
    selected === null ? null : editSymbolExample(p, scenario, selected);
  const correct = tested && edit?.delta === p.delta;
  const fragment =
    (token?.word ?? '') + (comma ? ',' : '') + (space ? ' ' : '');
  const modelBytes = (Array.from(fragment).length * p.bits) / 8;
  useInteractiveInterval(
    () => {
      if (step >= 2) {
        setStep(3);
        setPlaying(false);
      } else setStep(step + 1);
    },
    1000,
    { ...runtime, active: runtime.active && playing },
  );
  function reset() {
    setFeedback('');
    setTested(false);
    setStep(0);
    setPlaying(false);
  }
  function check() {
    reset();
    if (!token) {
      setFeedback('Сначала выбери слово в тексте.');
      return;
    }
    if (!space || comma !== rule.comma) {
      setFeedback(
        rule.comma
          ? 'По условию вместе со словом меняются и запятая, и пробел. Отметь оба разделителя.'
          : 'По условию меняется только один пробел вместе со словом. Запятую учитывать не нужно.',
      );
      return;
    }
    setTested(true);
    setFeedback(
      edit?.delta === p.delta
        ? 'Верно! Слово и разделители дают нужное изменение объёма.'
        : `Для этого слова изменение составит ${bytes(edit?.delta ?? 0)}, а в условии — ${bytes(p.delta)}. Выбери другое слово.`,
    );
  }
  return (
    <div className="symbol-practice" ref={stage}>
      <section
        className="memory-full-condition"
        aria-labelledby="symbol-condition-title"
      >
        <div>
          <p className="eyebrow">ОГЭ / ЗАДАНИЕ №1</p>
          <h2 id="symbol-condition-title">{rule.title}</h2>
          <p>
            Пример {(variant % symbolExamples[scenario].length) + 1} из{' '}
            {symbolExamples[scenario].length}
          </p>
        </div>
        <div>
          <p>
            {p.encoding === 'Unicode'
              ? 'В одной из кодировок Unicode'
              : `В кодировке ${p.encoding}`}{' '}
            каждый символ кодируется {p.bits} битами.{' '}
            {rule.repeat
              ? 'Ученик хотел написать текст'
              : 'Ученик написал текст'}{' '}
            без лишних пробелов:
          </p>
          <blockquote>{p.text}</blockquote>
          <p>
            {rule.repeat
              ? `Одно из слов ученик написал два раза подряд, добавив между ними ${rule.comma ? 'запятую и один пробел' : 'один пробел'}.`
              : 'Ученик вычеркнул одно слово и ставший лишним пробел. Пунктуация не изменилась.'}{' '}
            Объём {rule.repeat ? 'увеличился' : 'уменьшился'} на{' '}
            <strong>{bytes(p.delta)}</strong>. Напиши{' '}
            {rule.repeat ? 'лишнее' : 'вычеркнутое'} слово.
          </p>
          <p className="symbol-encoding">
            <strong>
              1 символ = {p.bits} бит = {bytes(p.bits / 8)}
            </strong>
            <span>
              Размер берём из условия. Пробел, запятая и дефис тоже занимают
              память.
            </span>
          </p>
        </div>
      </section>
      <div className="symbol-toolbar">
        <div role="group" aria-label="Режим практики">
          <button
            type="button"
            aria-pressed={!solo}
            onClick={() => {
              setSolo(false);
              reset();
            }}
          >
            Вместе
          </button>
          <button
            type="button"
            aria-pressed={solo}
            onClick={() => {
              setSolo(true);
              reset();
            }}
          >
            Самостоятельно
          </button>
        </div>
        <button type="button" onClick={onNext}>
          Следующий пример →
        </button>
      </div>
      <section
        className="symbol-workspace"
        aria-labelledby="symbol-choice-title"
      >
        <p className="eyebrow">ВЫБЕРИ · СОБЕРИ · ПРОВЕРЬ</p>
        <h2 id="symbol-choice-title">
          Какое слово {rule.repeat ? 'повторили' : 'удалили'}?
        </h2>
        <p>Нажми на слово, затем отметь разделители из условия.</p>
        <div
          className="symbol-words"
          role="group"
          aria-label="Слова исходного текста"
        >
          {words.map((w) => (
            <button
              key={w.start}
              type="button"
              aria-pressed={selected === w.start}
              onClick={() => {
                setSelected(w.start);
                reset();
              }}
            >
              {w.word}
            </button>
          ))}
        </div>
        <fieldset className="symbol-separators">
          <legend>Что изменилось вместе со словом?</legend>
          <label>
            <input
              type="checkbox"
              checked={space}
              onChange={(e) => {
                setSpace(e.target.checked);
                reset();
              }}
            />
            Один пробел <span aria-hidden="true">␣</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={comma}
              onChange={(e) => {
                setComma(e.target.checked);
                reset();
              }}
            />
            Одна запятая <span aria-hidden="true">,</span>
          </label>
        </fieldset>
        <p className="symbol-selection" role="status">
          Твой выбор: <strong>{token?.word ?? 'слово ещё не выбрано'}</strong>
        </p>
        {token && (!solo || tested) && (
          <div className="symbol-model">
            <p>Твоя модель изменившегося фрагмента</p>
            <div
              className="symbol-tiles"
              aria-label="Символы выбранного фрагмента"
            >
              {Array.from(fragment, (char, i) => (
                <span className="symbol-tile" key={i}>
                  <strong>{char === ' ' ? '␣' : char}</strong>
                  <span className="symbol-byte-stack" aria-hidden="true">
                    {Array.from({ length: p.bits / 8 }, (_, layer) => (
                      <i key={layer} />
                    ))}
                  </span>
                </span>
              ))}
            </div>
            <p>
              {Array.from(token.word).length} + {Number(space) + Number(comma)}{' '}
              ={' '}
              {quantity(Array.from(fragment).length, [
                'символ',
                'символа',
                'символов',
              ])}
              . {Array.from(fragment).length} × {p.bits / 8} ={' '}
              <strong>{bytes(modelBytes)}</strong>.
            </p>
            <small>
              Каждая пластинка — 1 байт. Под символом{' '}
              {p.bits / 8 === 1 ? 'одна пластинка' : 'две пластинки'}.
            </small>
          </div>
        )}
        <div className="symbol-actions">
          <button type="button" className="button button-dark" onClick={check}>
            Проверить выбор
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setSpace(false);
              setComma(false);
              reset();
            }}
          >
            Сбросить выбор
          </button>
        </div>
        <p className="symbol-feedback" role="status">
          {feedback}
        </p>
        {correct && (
          <p className="symbol-success">
            <strong>Ответ: {edit.word}</strong>. Проверка: (
            {Array.from(token?.word ?? '').length} + {rule.comma ? 2 : 1}) ×{' '}
            {p.bits / 8} = {bytes(p.delta)}.
          </p>
        )}
      </section>
      {tested && edit && (
        <section
          className="symbol-workspace symbol-proof"
          aria-labelledby="symbol-proof-title"
          data-step={step}
        >
          <h2 id="symbol-proof-title">Проверим изменение текста</h2>
          <div className="symbol-actions">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => {
                setPlaying(false);
                setStep(step - 1);
              }}
            >
              ← Назад
            </button>
            <button
              type="button"
              disabled={step === 3}
              onClick={() => {
                setPlaying(false);
                setStep(step + 1);
              }}
            >
              Следующий шаг →
            </button>
            <button
              type="button"
              disabled={runtime.reducedMotion}
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  if (step === 3) setStep(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? 'Пауза' : 'Воспроизвести'}
            </button>
          </div>
          <p className="symbol-step" role="status">
            Шаг {step + 1} из 4.{' '}
            {
              [
                'Исходный текст.',
                rule.repeat
                  ? 'Добавляется копия слова и разделители.'
                  : 'Убираются слово и один пробел.',
                'Сравниваем текст до и после.',
                'Сверяем изменение объёма с условием.',
              ][step]
            }
          </p>
          <div className="symbol-text-scene" key={step}>
            <p>
              <strong>{step < 2 ? 'До изменения' : 'После изменения'}</strong>
            </p>
            <blockquote>{step < 2 ? edit.before : edit.after}</blockquote>
            {step >= 1 && (
              <p className="symbol-fragment">
                {rule.repeat ? '+' : '−'} «{edit.fragment.replaceAll(' ', '␣')}»
              </p>
            )}
            {step === 3 && (
              <p>
                <strong>
                  {quantity(Array.from(edit.before).length, [
                    'символ',
                    'символа',
                    'символов',
                  ])}{' '}
                  →{' '}
                  {quantity(Array.from(edit.after).length, [
                    'символ',
                    'символа',
                    'символов',
                  ])}
                </strong>
                <br />
                Изменение: {edit.symbols} × {p.bits / 8} = {bytes(edit.delta)}.
                По условию нужно {bytes(p.delta)}.
              </p>
            )}
          </div>
          {runtime.reducedMotion && (
            <p>Движение отключено в настройках. Переключай шаги кнопками.</p>
          )}
        </section>
      )}
    </div>
  );
}
