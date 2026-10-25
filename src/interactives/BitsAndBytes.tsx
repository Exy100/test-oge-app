import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { alphabetCapacity, byteGroups } from '../lib/interactives/information';
import { bits as formatBits } from '../core/generators/task';
import BitCells from '../components/lessons/BitCells';
import ThreeScene from '../components/three/ThreeScene';

export default function BitsAndBytes({
  id,
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const initial =
    typeof parameters.alphabet === 'number' ? parameters.alphabet : 17;
  alphabetCapacity(initial, 4);
  const [size, setSize] = useState(String(initial));
  const [width, setWidth] = useState(4);
  const [bits, setBits] = useState('19');
  const [feedback, setFeedback] = useState('');
  const [volume, setVolume] = useState(false);
  let alphabet: ReturnType<typeof alphabetCapacity> | undefined;
  let groups: ReturnType<typeof byteGroups> | undefined;
  let error = '';
  try {
    alphabet = alphabetCapacity(Number(size), width);
    groups = byteGroups(bits.trim() ? Number(bits) : NaN);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Проверь числа.';
  }
  return (
    <div className="information-lab">
      <p>
        Один бит различает два состояния. Добавь ещё один бит — число разных
        кодовых слов удвоится. Здесь все буквы кодируются словами одинаковой
        длины.
      </p>
      <label htmlFor={`${id}-size`}>Знаков в алфавите (2–64)</label>
      <input
        id={`${id}-size`}
        type="number"
        min={2}
        max={64}
        step={1}
        value={size}
        onChange={(event) => {
          setSize(event.target.value);
          setFeedback('');
        }}
      />
      <label htmlFor={`${id}-width`}>Длина кода одной буквы</label>
      <select
        id={`${id}-width`}
        value={width}
        onChange={(event) => {
          setWidth(Number(event.target.value));
          setFeedback('');
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <option key={value} value={value}>
            {formatBits(value)}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      {alphabet && (
        <>
          <p role="status">
            Разных кодов: {alphabet.capacity}.{' '}
            {alphabet.fits
              ? 'Всему алфавиту хватает кодов.'
              : 'Кодов не хватает: увеличь длину.'}
          </p>
          <ul
            className="binary-codes"
            aria-label="Все кодовые слова выбранной длины"
          >
            {Array.from({ length: alphabet.capacity }, (_, index) => (
              <li key={index}>
                <code>{index.toString(2).padStart(width, '0')}</code>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              setFeedback(
                width === alphabet.minimum
                  ? `Верно: ${formatBits(width)} — наименьшая достаточная длина.`
                  : alphabet.fits
                    ? `Кодов достаточно, но можно короче. Проверь длину ${formatBits(width - 1)}.`
                    : 'Не всем знакам хватает отдельного кода. Добавь бит.',
              );
            }}
          >
            Проверить минимальную длину
          </button>
        </>
      )}
      <p role="status">{feedback}</p>
      <label htmlFor={`${id}-bits`}>Всего бит (0–1024)</label>
      <input
        id={`${id}-bits`}
        type="number"
        min={0}
        max={1024}
        step={1}
        value={bits}
        onChange={(event) => {
          setBits(event.target.value);
        }}
      />
      {groups && (
        <>
          <label>
            <input
              type="checkbox"
              checked={volume}
              onChange={(event) => {
                setVolume(event.target.checked);
              }}
            />
            Объёмная схема
          </label>
          {volume ? (
            <ThreeScene
              id={id}
              active={active}
              reducedMotion={reducedMotion}
              modulePath="/src/interactives/BitCells3D.tsx"
              parameters={{ bits: Number(bits) }}
              fallback={<BitCells id={id} bits={Number(bits)} />}
            />
          ) : (
            <BitCells id={id} bits={Number(bits)} />
          )}
          <p role="status">
            Полных байтов: {groups.full}; осталось бит: {groups.remainder}.
            Проверка: {groups.full} × 8 + {groups.remainder} = {Number(bits)}{' '}
            бит.
          </p>
        </>
      )}
    </div>
  );
}
