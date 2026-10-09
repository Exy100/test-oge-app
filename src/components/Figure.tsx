import { useId } from 'react';
import type { ReactNode } from 'react';
import type { FigureSpec } from '../core/types';
import { describeFigure, logicLabels } from '../core/figures/describe';
import { layoutDiagram } from '../core/figures/layout';
import '../styles/figure.css';

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th scope="col" key={index}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((value, column) => (
              <td key={column}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Figure({ spec }: { spec: FigureSpec }) {
  const id = useId().replaceAll(':', '');
  const text = describeFigure(spec);
  let drawing: ReactNode;
  if (
    spec.kind === 'weighted-graph' ||
    spec.kind === 'directed-graph' ||
    spec.kind === 'logic-circuit'
  ) {
    const circuit = spec.kind === 'logic-circuit';
    const nodes = circuit
      ? spec.nodes.map((node) => ({
          id: node.id,
          label: `${node.operation === 'input' ? node.label : logicLabels[node.operation]} (${node.id})${node.id === spec.output ? ' → выход' : ''}`,
        }))
      : spec.nodes;
    const edges = circuit
      ? spec.nodes.flatMap((node) =>
          node.operation === 'input'
            ? []
            : node.inputs.map((input) => ({ from: input, to: node.id })),
        )
      : spec.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          ...('weight' in edge ? { label: String(edge.weight) } : {}),
        }));
    const layout = layoutDiagram(nodes, edges);
    drawing = (
      <svg
        className="figure-diagram"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        role="img"
        aria-label={text}
      >
        <defs>
          <marker
            id={`${id}-arrow`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {layout.edges.map((edge, index) => (
          <g key={index}>
            <path
              className="figure-wire"
              d={edge.path}
              markerEnd={
                spec.kind === 'weighted-graph' ? undefined : `url(#${id}-arrow)`
              }
            />
            {edge.label !== undefined && (
              <g data-label="edge">
                <rect
                  className="figure-label-bg"
                  x={edge.x - edge.label.length * 9 - 8}
                  y={edge.y - 14}
                  width={edge.label.length * 18 + 16}
                  height="28"
                />
                <text
                  x={edge.x}
                  y={edge.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {edge.label}
                </text>
              </g>
            )}
          </g>
        ))}
        {layout.nodes.map((node) => (
          <g key={node.id} data-label="node">
            <rect
              className="figure-node"
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={circuit ? 4 : 20}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + 24}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    );
  } else {
    switch (spec.kind) {
      case 'table':
        drawing = <DataTable columns={spec.columns} rows={spec.rows} />;
        break;
      case 'code-table':
        drawing = (
          <DataTable
            columns={['Символ', 'Код']}
            rows={spec.entries.map((entry) => [entry.symbol, entry.code])}
          />
        );
        break;
      case 'place-value':
        drawing = (
          <DataTable
            columns={['Разряд', 'Цифра', 'Вес']}
            rows={spec.digits.map((digit, index) => [
              spec.digits.length - index - 1,
              digit.toString(spec.base).toUpperCase(),
              String(
                BigInt(spec.base) ** BigInt(spec.digits.length - index - 1),
              ),
            ])}
          />
        );
        break;
      case 'file-tree': {
        const children = (parent: string): ReactNode => (
          <ul>
            {spec.entries
              .filter(
                (entry) =>
                  entry.path.slice(
                    0,
                    Math.max(0, entry.path.lastIndexOf('/')),
                  ) === parent,
              )
              .sort((a, b) => a.path.localeCompare(b.path, 'ru'))
              .map((entry) => (
                <li key={entry.path}>
                  <span>
                    {entry.kind === 'directory' ? '▸ Каталог ' : 'Файл '}
                    {entry.path.slice(entry.path.lastIndexOf('/') + 1)}
                    {entry.kind === 'file'
                      ? ` — ${String(entry.size)} байт`
                      : ''}
                  </span>
                  {entry.kind === 'directory' && children(entry.path)}
                </li>
              ))}
          </ul>
        );
        drawing = <div className="figure-tree">{children('')}</div>;
        break;
      }
      case 'network-address':
        drawing = (
          <div className="figure-address">
            <code>
              {spec.protocol}://{spec.host}/{spec.path}
            </code>
            <dl>
              <dt>Протокол</dt>
              <dd>{spec.protocol}</dd>
              <dt>Сервер</dt>
              <dd>{spec.host}</dd>
              <dt>Путь</dt>
              <dd>{spec.path}</dd>
            </dl>
          </div>
        );
        break;
      case 'robot-field': {
        // A grid pattern does not allocate rows × columns DOM nodes.
        const size = 48;
        const width = spec.columns * size;
        const height = spec.rows * size;
        drawing = (
          <div>
            <svg
              className="figure-robot"
              width={width}
              height={height}
              viewBox={`0 0 ${String(width)} ${String(height)}`}
              role="img"
              aria-label={text}
            >
              <defs>
                <pattern
                  id={`${id}-grid`}
                  width={size}
                  height={size}
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M 48 0 H 0 V 48" className="figure-wire" />
                </pattern>
                <pattern
                  id={`${id}-paint`}
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M 0 8 L 8 0" className="figure-wire" />
                </pattern>
              </defs>
              <rect width={width} height={height} fill={`url(#${id}-grid)`} />
              {spec.painted.map((cell) => (
                <rect
                  key={`${String(cell.row)},${String(cell.column)}`}
                  x={cell.column * size + 4}
                  y={cell.row * size + 4}
                  width="40"
                  height="40"
                  fill={`url(#${id}-paint)`}
                />
              ))}
              {spec.targets.map((cell) => (
                <circle
                  key={`${String(cell.row)},${String(cell.column)}`}
                  cx={cell.column * size + 24}
                  cy={cell.row * size + 24}
                  r="13"
                  className="figure-target"
                />
              ))}
              {spec.walls.map((wall, index) => {
                const horizontal = wall.from.row !== wall.to.row;
                const x =
                  (horizontal
                    ? wall.from.column
                    : Math.max(wall.from.column, wall.to.column)) * size;
                const y =
                  (horizontal
                    ? Math.max(wall.from.row, wall.to.row)
                    : wall.from.row) * size;
                return (
                  <line
                    key={index}
                    x1={x}
                    y1={y}
                    x2={x + (horizontal ? size : 0)}
                    y2={y + (horizontal ? 0 : size)}
                    className="figure-wall"
                  />
                );
              })}
              <rect
                x="2"
                y="2"
                width={width - 4}
                height={height - 4}
                className="figure-boundary"
              />
              <text
                x={spec.start.column * size + 24}
                y={spec.start.row * size + 24}
                textAnchor="middle"
                dominantBaseline="middle"
                className="figure-start"
              >
                Р
              </text>
            </svg>
            <p className="figure-legend">
              Р — Робот · круг — цель · штриховка — закрашено · толстая линия —
              стена
            </p>
          </div>
        );
        break;
      }
    }
  }
  return (
    <figure className="task-figure" data-kind={spec.kind}>
      <figcaption>{spec.description}</figcaption>
      <div
        className="figure-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Рисунок: ${spec.description}`}
      >
        {drawing}
      </div>
      <details>
        <summary>Текстовое описание</summary>
        <p className="figure-description">{text}</p>
      </details>
    </figure>
  );
}
