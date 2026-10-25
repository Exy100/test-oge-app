import type { RobotField } from '../../core/robot';
export default function MazeDiagram({
  field,
  position = field.start,
  painted = field.painted,
}: {
  field: RobotField;
  position?: RobotField['start'];
  painted?: RobotField['painted'];
}) {
  const size = 32,
    pad = 24;
  return (
    <>
      <svg
        role="img"
        viewBox={`0 0 ${String(field.columns * size + pad + 4)} ${String(field.rows * size + pad + 4)}`}
        aria-label={`Поле ${String(field.rows)} на ${String(field.columns)}. Робот: строка ${String(position.row + 1)}, столбец ${String(position.column + 1)}. Кресты — цели, закрашенные клетки — результат.`}
      >
        <title>Плоское поле Робота</title>
        {Array.from({ length: field.rows * field.columns }, (_, i) => {
          const row = Math.floor(i / field.columns),
            column = i % field.columns,
            target = field.targets.some(
              (c) => c.row === row && c.column === column,
            ),
            filled = painted.some((c) => c.row === row && c.column === column);
          return (
            <g key={i}>
              <rect
                x={pad + column * size}
                y={pad + row * size}
                width={size}
                height={size}
                fill={filled ? 'currentColor' : 'none'}
                stroke="currentColor"
              />
              {target && (
                <path
                  d={`M${String(pad + column * size + 8)} ${String(pad + row * size + 8)}l16 16m0 -16l-16 16`}
                  stroke={filled ? 'var(--surface)' : 'currentColor'}
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
        {Array.from({ length: field.rows }, (_, i) => (
          <text
            key={`r${String(i)}`}
            x="4"
            y={pad + i * size + 22}
            fill="currentColor"
          >
            {i + 1}
          </text>
        ))}
        {Array.from({ length: field.columns }, (_, i) => (
          <text
            key={`c${String(i)}`}
            x={pad + i * size + 12}
            y="17"
            fill="currentColor"
          >
            {i + 1}
          </text>
        ))}
        {field.walls.map((wall, i) => {
          const horizontal = wall.from.row !== wall.to.row,
            x =
              pad +
              (horizontal
                ? wall.from.column
                : Math.max(wall.from.column, wall.to.column)) *
                size,
            y =
              pad +
              (horizontal
                ? Math.max(wall.from.row, wall.to.row)
                : wall.from.row) *
                size;
          return (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x + (horizontal ? size : 0)}
              y2={y + (horizontal ? 0 : size)}
              stroke="currentColor"
              strokeWidth="5"
            />
          );
        })}
        <circle
          cx={pad + (position.column + 0.5) * size}
          cy={pad + (position.row + 0.5) * size}
          r="8"
          fill="var(--surface)"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
      <details>
        <summary>Координаты целей и стен</summary>
        <p>
          Цели (строка, столбец):{' '}
          {field.targets
            .map((c) => `(${String(c.row + 1)}, ${String(c.column + 1)})`)
            .join('; ') || 'нет'}
          .
        </p>
        <p>
          Внешняя граница непроходима. Внутренние стены между клетками:{' '}
          {field.walls
            .map(
              (w) =>
                `(${String(w.from.row + 1)}, ${String(w.from.column + 1)}) и (${String(w.to.row + 1)}, ${String(w.to.column + 1)})`,
            )
            .join('; ') || 'нет'}
          .
        </p>
      </details>
    </>
  );
}
