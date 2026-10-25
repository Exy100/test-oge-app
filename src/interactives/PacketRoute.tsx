import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  packetLevels,
  nextPacketNodes,
  checkPacket,
  saveGameLevel,
} from '../lib/interactives/games';
import { addressLabs, assembleAddress } from '../lib/interactives/networks';
import { browserStore } from '../core/storage/browser';
import GameLevels from '../components/lessons/GameLevels';
import GraphDiagram from '../components/lessons/GraphDiagram';
import GameView from '../components/three/GameView';

export default function PacketRoute({
  id,
  active,
  reducedMotion,
}: InteractiveProps) {
  const [selected, setSelected] = useState(0),
    [sequence, setSequence] = useState('');
  const [path, setPath] = useState(['А']),
    [count, setCount] = useState(''),
    [feedback, setFeedback] = useState('');
  const level = packetLevels[selected];
  if (!level) throw new RangeError('Неизвестный уровень сети.');
  const problem = addressLabs[level.address].problem;
  const next = nextPacketNodes(level, path);
  let assembled: string;
  try {
    assembled = assembleAddress(problem, sequence).address;
  } catch {
    assembled = 'Проверь метки 1–7: нужны разные цифры без пробелов.';
  }
  return (
    <div className="information-lab">
      <p>
        Учебная игра по темам №7 и №9. Сеть — ориентированный граф для
        упражнения, а не модель реальной маршрутизации Интернета.
      </p>
      <GameLevels
        id={id}
        gameId="packet-route"
        lessonId="restore-address"
        levels={packetLevels}
        selected={selected}
        onSelect={(index) => {
          setSelected(index);
          setSequence('');
          setPath(['А']);
          setCount('');
          setFeedback('');
        }}
      />
      <p>
        Собери адрес <code className="lab-address">{problem.target}</code> всеми
        семью фрагментами. Запиши их метки по порядку.
      </p>
      <div
        className="lab-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Фрагменты адреса"
      >
        <table>
          <caption>Семь фрагментов URL</caption>
          <thead>
            <tr>
              <th scope="col">Метка</th>
              <th scope="col">Фрагмент</th>
            </tr>
          </thead>
          <tbody>
            {problem.fragments.map((fragment, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td>
                  <code>{fragment}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label htmlFor={`${id}-address`}>Метки фрагментов URL</label>
      <input
        id={`${id}-address`}
        inputMode="numeric"
        maxLength={7}
        value={sequence}
        onChange={(event) => {
          setSequence(event.target.value);
          setFeedback('');
        }}
      />
      <p className="lab-address" role="status">
        Собранный адрес: {assembled || 'не собран'}
      </p>
      <p>
        Доставь пакет из А в {level.graph.nodes.at(-1)} только по стрелкам.{' '}
        {level.via ? `Пройди через ${level.via}. ` : 'Подходит любой путь. '}
        {level.avoid
          ? `Узел ${level.avoid} закрыт, проходить через него нельзя.`
          : ''}{' '}
        Сосчитай все пути с этими условиями.
      </p>
      <GameView
        id={id}
        active={active}
        reducedMotion={reducedMotion}
        modulePath="/src/interactives/Packet3D.tsx"
        parameters={{ level: selected, path }}
        fallback={
          <GraphDiagram
            id={`${id}-flat`}
            {...level.graph}
            edges={level.graph.edges.map(([from, to]) => ({ from, to }))}
            selected={path}
            directed
          />
        }
      />
      <p>
        Стрелки сети:{' '}
        {level.graph.edges.map(([from, to]) => `${from} → ${to}`).join('; ')}.
      </p>
      <p role="status">
        Пройденный маршрут: {path.join(' → ')}. Пакет в {path.at(-1)}.
      </p>
      <div className="interactive-toolbar">
        {next.map((node) => (
          <button
            key={node}
            type="button"
            className="button"
            onClick={() => {
              setPath([...path, node]);
              setFeedback('');
            }}
          >
            В узел {node}
          </button>
        ))}
        <button
          type="button"
          className="button"
          disabled={path.length < 2}
          onClick={() => {
            setPath(path.slice(0, -1));
            setFeedback('');
          }}
        >
          На шаг назад
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setPath(['А']);
            setFeedback('');
          }}
        >
          В начало сети
        </button>
      </div>
      <label htmlFor={`${id}-count`}>Всего допустимых путей</label>
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
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          const result = checkPacket(level, sequence, path, count);
          setFeedback(result.message);
          if (result.correct)
            saveGameLevel(
              browserStore(),
              'restore-address',
              'packet-route',
              level.id,
            );
        }}
      >
        Проверить доставку и число путей
      </button>
      <p role="status">{feedback}</p>
    </div>
  );
}
