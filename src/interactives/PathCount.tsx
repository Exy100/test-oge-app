import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { directedMaps, directedCounts } from '../lib/interactives/graphs';
import GraphDiagram from '../components/lessons/GraphDiagram';

export default function PathCount({ id, parameters }: InteractiveProps) {
  const initial = parameters.preset ?? 'fork';
  if (initial !== 'fork' && initial !== 'merge')
    throw new RangeError('Неизвестная направленная схема.');
  const [preset, setPreset] = useState<keyof typeof directedMaps>(initial);
  const [closed, setClosed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0),
    [feedback, setFeedback] = useState('');
  const graph = directedMaps[preset],
    start = graph.nodes[0] ?? '',
    end = graph.nodes.at(-1) ?? '';
  const edges = graph.edges.filter(([, to]) => !closed || to !== end);
  const solution = directedCounts(graph.nodes, edges, start, end);
  const shown = solution.order.slice(0, step + 1),
    latest = shown.at(-1) ?? start;
  const parents = solution.incoming.get(latest) ?? [];
  function reset() {
    setAnswers({});
    setStep(0);
    setFeedback('');
  }
  return (
    <div className="information-lab">
      <p>
        Запиши число путей из А в каждую вершину. Двигайся только по стрелкам. В
        А ставим 1 как начальное значение; в остальных вершинах складываем
        значения всех непосредственных предшественников.
      </p>
      <label htmlFor={`${id}-preset`}>Направленная схема</label>
      <select
        id={`${id}-preset`}
        value={preset}
        onChange={(event) => {
          setPreset(event.target.value as keyof typeof directedMaps);
          reset();
        }}
      >
        <option value="fork">Семь вершин: развилки</option>
        <option value="merge">Восемь вершин: слияние ветвей</option>
      </select>
      <label>
        <input
          type="checkbox"
          checked={closed}
          onChange={(event) => {
            setClosed(event.target.checked);
            reset();
          }}
        />{' '}
        Убрать все стрелки в финиш
      </label>
      <GraphDiagram
        id={id}
        nodes={graph.nodes}
        positions={graph.positions}
        edges={edges.map(([from, to]) => ({ from, to }))}
        directed
      />
      <div
        className="lab-table-scroll lab-table-wide"
        tabIndex={0}
        role="region"
        aria-label="Таблица входящих стрелок"
      >
        <table>
          <caption>
            Число путей из А; порядок строк позволяет считать слева направо по
            схеме
          </caption>
          <thead>
            <tr>
              <th scope="col">Вершина</th>
              <th scope="col">Входят из</th>
              <th scope="col">Твой подсчёт</th>
            </tr>
          </thead>
          <tbody>
            {solution.order.map((node) => (
              <tr key={node}>
                <th scope="row">{node}</th>
                <td>
                  {(solution.incoming.get(node) ?? []).join(', ') || 'Нет'}
                </td>
                <td>
                  {node === start ? (
                    '1 (начало)'
                  ) : (
                    <input
                      aria-label={`Путей в ${node}`}
                      inputMode="numeric"
                      maxLength={5}
                      value={answers[node] ?? ''}
                      onChange={(event) => {
                        setAnswers({ ...answers, [node]: event.target.value });
                        setFeedback('');
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="button button-dark"
        onClick={() => {
          const wrong = solution.order.find(
            (node) =>
              node !== start &&
              (!/^\d+$/u.test((answers[node] ?? '').trim()) ||
                Number(answers[node]) !== solution.counts.get(node)),
          );
          setFeedback(
            wrong
              ? `Проверь вершину ${wrong}: сложи числа путей у всех вершин, из которых в неё входит стрелка. Если входящих доступных путей нет, запиши 0.`
              : `Верно: все вершины посчитаны. Из А в ${end} ведёт путей: ${String(solution.total)}.`,
          );
        }}
      >
        Проверить подсчёт
      </button>
      <p role="status">{feedback}</p>
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button button-light"
          disabled={step >= solution.order.length - 1}
          onClick={() => {
            setStep(step + 1);
          }}
        >
          Следующая вершина
        </button>
        <button type="button" className="button button-light" onClick={reset}>
          Сбросить подсчёт
        </button>
      </div>
      <p role="status">
        {latest === start
          ? 'Начинаем с А: начальное значение 1.'
          : `${latest}: ${parents.length ? parents.map((node) => `${node} (${String(solution.counts.get(node) ?? 0)})`).join(' + ') : 'нет входящих стрелок'} → ${String(solution.counts.get(latest) ?? 0)}.`}
      </p>
      <p>
        Открытые значения:{' '}
        {shown
          .map((node) => `${node} = ${String(solution.counts.get(node) ?? 0)}`)
          .join('; ')}
        .
      </p>
    </div>
  );
}
