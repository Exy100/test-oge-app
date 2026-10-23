import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import {
  roadMaps,
  roadLength,
  shortestRoad,
  acceptsShortest,
} from '../lib/interactives/graphs';
import GraphDiagram from '../components/lessons/GraphDiagram';

export default function ShortestPath({ id, parameters }: InteractiveProps) {
  const initial = parameters.preset ?? 'equal';
  if (initial !== 'equal' && initial !== 'detour')
    throw new RangeError('Неизвестный граф дорог.');
  const [preset, setPreset] = useState<keyof typeof roadMaps>(initial);
  const [path, setPath] = useState<string[]>(['А']);
  const [feedback, setFeedback] = useState('');
  const [revealed, setRevealed] = useState(false);
  const graph = roadMaps[preset],
    start = graph.nodes[0] ?? '',
    end = graph.nodes.at(-1) ?? '';
  const best = shortestRoad(graph.nodes, graph.edges, start, end);
  const length = roadLength(graph.edges, path);
  const current = path.at(-1);
  const next = graph.nodes.filter(
    (node) =>
      !path.includes(node) &&
      graph.edges.some(
        ([a, b]) =>
          (a === current && b === node) || (a === node && b === current),
      ),
  );
  function clear() {
    setFeedback('');
    setRevealed(false);
  }
  return (
    <div className="information-lab">
      <p>
        Пройди из А в Е. Числа обозначают километры; дороги двусторонние.
        Вершины нельзя повторять. Кратчайший путь определяется суммой длин, а не
        числом дорог.
      </p>
      <label htmlFor={`${id}-preset`}>Граф дорог</label>
      <select
        id={`${id}-preset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value as keyof typeof roadMaps);
          setPath(['А']);
          clear();
        }}
      >
        <option value="equal">Несколько равных кратчайших путей</option>
        <option value="detour">Ближайший сосед не гарантирует успех</option>
      </select>
      <GraphDiagram
        id={id}
        nodes={graph.nodes}
        positions={graph.positions}
        edges={graph.edges.map(([from, to, label]) => ({ from, to, label }))}
        selected={path}
      />
      <div
        className="lab-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Таблица длин дорог"
      >
        <table>
          <caption>Все дороги графа; других прямых дорог нет</caption>
          <thead>
            <tr>
              <th scope="col">Дорога</th>
              <th scope="col">Км</th>
            </tr>
          </thead>
          <tbody>
            {graph.edges.map(([a, b, weight]) => (
              <tr key={a + b}>
                <td>
                  {a} ↔ {b}
                </td>
                <td>{weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="interactive-toolbar">
        {graph.nodes.slice(1).map((node) => (
          <button
            type="button"
            className="button button-light"
            key={node}
            disabled={current === end || !next.includes(node)}
            onClick={() => {
              setPath([...path, node]);
              clear();
            }}
          >
            Перейти в {node}
          </button>
        ))}
      </div>
      <p role="status">
        Маршрут: {path.join(' → ')}. Длина: {length} км.
      </p>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-light"
          disabled={path.length < 2}
          onClick={() => {
            setPath(path.slice(0, -1));
            clear();
          }}
        >
          Шаг назад
        </button>
        <button
          type="button"
          className="button button-light"
          onClick={() => {
            setPath([start]);
            clear();
          }}
        >
          Начать путь заново
        </button>
        <button
          className="button button-dark"
          type="button"
          onClick={() => {
            setFeedback(
              current !== end
                ? 'Путь пока не завершён: нужно дойти до Е.'
                : acceptsShortest(graph.nodes, graph.edges, start, end, path)
                  ? `Верно: этот путь кратчайший, его длина ${String(length)} км. Другой маршрут той же минимальной длины тоже принимается.`
                  : `Есть более короткий путь. Сравни сумму длин; минимальная длина — ${String(best.distance)} км.`,
            );
          }}
        >
          Проверить путь
        </button>
      </div>
      <p role="status">{feedback}</p>
      <button
        type="button"
        className="button button-light"
        aria-expanded={revealed}
        onClick={() => {
          setRevealed(!revealed);
        }}
      >
        Показать один кратчайший путь
      </button>
      {revealed && (
        <p>
          Один из кратчайших: {best.path.join(' → ')}, {best.distance} км. Сложи
          длины его дорог и сравни со своим.
        </p>
      )}
    </div>
  );
}
