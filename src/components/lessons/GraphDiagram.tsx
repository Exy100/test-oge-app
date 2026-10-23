import type { Position } from '../../lib/interactives/graphs';

export default function GraphDiagram({
  id,
  nodes,
  positions,
  edges,
  selected = [],
  directed = false,
}: {
  id: string;
  nodes: readonly string[];
  positions: readonly Position[];
  edges: readonly { from: string; to: string; label?: number }[];
  selected?: readonly string[];
  directed?: boolean;
}) {
  return (
    <svg
      role="img"
      viewBox="0 0 425 235"
      aria-labelledby={`${id}-graph-title ${id}-graph-desc`}
      className="teaching-graph"
    >
      <title id={`${id}-graph-title`}>
        {directed ? 'Схема направленных путей' : 'Граф двусторонних дорог'}
      </title>
      <desc id={`${id}-graph-desc`}>
        Пункты: {nodes.join(', ')}.{' '}
        {directed ? 'Двигайся по стрелкам.' : 'Числа у дорог — длины.'} Все
        связи также перечислены текстом под схемой.
      </desc>
      <defs>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map(({ from, to, label }) => {
        const a = positions[nodes.indexOf(from)],
          b = positions[nodes.indexOf(to)];
        if (!a || !b) throw new Error('Нет положения вершины.');
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const x1 = a.x + ((b.x - a.x) / distance) * 18,
          y1 = a.y + ((b.y - a.y) / distance) * 18;
        const x2 = b.x - ((b.x - a.x) / distance) * 22,
          y2 = b.y - ((b.y - a.y) / distance) * 22;
        const curved = !directed && from === nodes[0] && to === nodes.at(-1);
        const active = selected.some(
          (node, index) =>
            (node === from && selected[index + 1] === to) ||
            (!directed && node === to && selected[index + 1] === from),
        );
        const x = (a.x + b.x) / 2,
          y = curved ? 20 : (a.y + b.y) / 2;
        return (
          <g key={from + to} data-selected={active}>
            <path
              d={
                curved
                  ? `M${String(x1)} ${String(y1)} Q205 -100 ${String(x2)} ${String(y2)}`
                  : `M${String(x1)} ${String(y1)} L${String(x2)} ${String(y2)}`
              }
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 4 : 1.5}
              markerEnd={directed ? `url(#${id}-arrow)` : undefined}
            />
            {label !== undefined && (
              <>
                <rect
                  x={x - 15}
                  y={y - 12}
                  width={30}
                  height={24}
                  rx={4}
                  fill="var(--surface)"
                />
                <text x={x} y={y + 5} fill="currentColor" textAnchor="middle">
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })}
      {nodes.map((node, index) => {
        const position = positions[index];
        if (!position) throw new Error('Нет положения вершины.');
        return (
          <g key={node}>
            <circle
              cx={position.x}
              cy={position.y}
              r={17}
              fill="var(--surface)"
              stroke="currentColor"
              strokeWidth={selected.includes(node) ? 3 : 1}
            />
            <text
              x={position.x}
              y={position.y + 5}
              fill="currentColor"
              textAnchor="middle"
            >
              {node}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
