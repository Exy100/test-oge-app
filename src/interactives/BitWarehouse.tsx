import { bytes as formatBytes } from '../core/generators/task';
import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  warehouseLevels,
  checkWarehouse,
  saveGameLevel,
} from '../lib/interactives/games';
import { browserStore } from '../core/storage/browser';
import GameLevels from '../components/lessons/GameLevels';
import WarehouseDiagram from '../components/lessons/WarehouseDiagram';
import GameView from '../components/three/GameView';

export default function BitWarehouse({
  id,
  active,
  reducedMotion,
}: InteractiveProps) {
  const [selected, setSelected] = useState(0),
    [counts, setCounts] = useState([0, 0, 0]);
  const [bits, setBits] = useState(''),
    [bytes, setBytes] = useState(''),
    [feedback, setFeedback] = useState('');
  const level = warehouseLevels[selected];
  if (!level) throw new RangeError('Неизвестный уровень склада.');
  function clearCalculation() {
    setBits('');
    setBytes('');
    setFeedback('');
  }
  return (
    <div className="information-lab">
      <p>
        Учебная игра по темам №1 и №10. Контейнеры содержат текст без служебных
        данных; каждый символ занимает указанное число бит.
      </p>
      <GameLevels
        id={id}
        gameId="bit-warehouse"
        lessonId="bits-bytes"
        levels={warehouseLevels}
        selected={selected}
        onSelect={(index) => {
          setSelected(index);
          setCounts([0, 0, 0]);
          clearCalculation();
        }}
      />
      <p>
        Умести не меньше {level.minimum} контейнеров в{' '}
        {formatBytes(level.capacity)}. Возьми хотя бы один контейнер каждого
        вида. Затем объясни расчёт двумя числами: всего бит и всего байт.
      </p>
      {level.cargo.map((cargo, i) => (
        <div key={cargo.name}>
          <label htmlFor={`${id}-cargo-${String(i)}`}>
            {cargo.name}:{' '}
            <span>
              {cargo.digits}
              <sub>{cargo.base}</sub>
            </span>{' '}
            символов, по {cargo.bitsPerSymbol} бит на символ. Контейнеров
          </label>
          <select
            id={`${id}-cargo-${String(i)}`}
            value={counts[i]}
            onChange={(event) => {
              setCounts(
                counts.map((n, index) =>
                  index === i ? Number(event.target.value) : n,
                ),
              );
              clearCalculation();
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      ))}
      <GameView
        id={id}
        active={active}
        reducedMotion={reducedMotion}
        modulePath="/src/interactives/Warehouse3D.tsx"
        parameters={{ level: selected, counts }}
        fallback={<WarehouseDiagram level={level} counts={counts} />}
      />
      <label htmlFor={`${id}-bits`}>Всего бит в выбранном грузе</label>
      <input
        id={`${id}-bits`}
        inputMode="numeric"
        maxLength={8}
        value={bits}
        onChange={(event) => {
          setBits(event.target.value);
          setFeedback('');
        }}
      />
      <label htmlFor={`${id}-bytes`}>Всего байт в выбранном грузе</label>
      <input
        id={`${id}-bytes`}
        inputMode="numeric"
        maxLength={8}
        value={bytes}
        onChange={(event) => {
          setBytes(event.target.value);
          setFeedback('');
        }}
      />
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          const result = checkWarehouse(level, counts, bits, bytes);
          setFeedback(result.message);
          if (result.correct)
            saveGameLevel(
              browserStore(),
              'bits-bytes',
              'bit-warehouse',
              level.id,
            );
        }}
      >
        Проверить упаковку и расчёт
      </button>
      <p role="status">{feedback}</p>
    </div>
  );
}
