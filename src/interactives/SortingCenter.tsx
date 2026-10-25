import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { sortingLevels, checkSorting } from '../lib/interactives/factory-games';
import { saveGameLevel } from '../lib/interactives/games';
import { browserStore } from '../core/storage/browser';
import GameLevels from '../components/lessons/GameLevels';
import GameView from '../components/three/GameView';
import SortingDiagram from '../components/lessons/SortingDiagram';

export default function SortingCenter({
  id,
  active,
  reducedMotion,
}: InteractiveProps) {
  const [selected, setSelected] = useState(0),
    [current, setCurrent] = useState(0),
    [routes, setRoutes] = useState<(boolean | null)[]>(
      Array.from({ length: 8 }, () => null),
    );
  const [count, setCount] = useState(''),
    [sum, setSum] = useState(''),
    [feedback, setFeedback] = useState('');
  const level = sortingLevels[selected],
    parcel = level?.parcels[current];
  if (!level || !parcel)
    throw new RangeError('Неизвестный уровень сортировки.');
  function route(value: boolean) {
    setRoutes(routes.map((old, i) => (i === current ? value : old)));
    setCurrent((current + 1) % 8);
    setCount('');
    setSum('');
    setFeedback('');
  }
  return (
    <div className="information-lab">
      <p>
        Учебная игра по темам №14 и №16. Примени условие к каждой посылке, затем
        вычисли счётчик и сумму. Условные посылки не заменяют экзаменационную
        таблицу или программу.
      </p>
      <GameLevels
        id={id}
        gameId="sorting-center"
        lessonId="sheet-selection"
        levels={sortingLevels}
        selected={selected}
        onSelect={(index) => {
          setSelected(index);
          setCurrent(0);
          setRoutes(Array.from({ length: 8 }, () => null));
          setCount('');
          setSum('');
          setFeedback('');
        }}
      />
      <p>{level.goal}</p>
      <GameView
        id={id}
        active={active}
        reducedMotion={reducedMotion}
        modulePath="/src/interactives/Sorting3D.tsx"
        parameters={{ level: selected, current, routes }}
        fallback={
          <SortingDiagram
            parcels={level.parcels}
            routes={routes}
            current={current}
          />
        }
      />
      <label htmlFor={`${id}-parcel`}>Посылка для распределения</label>
      <select
        id={`${id}-parcel`}
        value={current}
        onChange={(event) => {
          setCurrent(Number(event.target.value));
        }}
      >
        {level.parcels.map((item, i) => (
          <option key={item.id} value={i}>
            №{item.id}: зона {item.zone}, {item.weight} кг
          </option>
        ))}
      </select>
      <p role="status">
        Сейчас посылка №{parcel.id}: зона {parcel.zone}, масса {parcel.weight}{' '}
        кг. Решение:{' '}
        {routes[current] === null
          ? 'не принято'
          : routes[current]
            ? 'отбор'
            : 'остальные'}
        .
      </p>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button"
          onClick={() => {
            route(true);
          }}
        >
          В отбор
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            route(false);
          }}
        >
          В остальные
        </button>
      </div>
      <label htmlFor={`${id}-count`}>Количество отобранных посылок</label>
      <input
        id={`${id}-count`}
        inputMode="numeric"
        maxLength={4}
        value={count}
        onChange={(event) => {
          setCount(event.target.value);
          setFeedback('');
        }}
      />
      <label htmlFor={`${id}-sum`}>Суммарная масса отбора, кг</label>
      <input
        id={`${id}-sum`}
        inputMode="numeric"
        maxLength={6}
        value={sum}
        onChange={(event) => {
          setSum(event.target.value);
          setFeedback('');
        }}
      />
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          const checked = checkSorting(level, routes, count, sum);
          setFeedback(checked.message);
          if (checked.correct)
            saveGameLevel(
              browserStore(),
              'sheet-selection',
              'sorting-center',
              level.id,
            );
        }}
      >
        Проверить отбор и расчёт
      </button>
      <p role="status">{feedback}</p>
    </div>
  );
}
