import type { InteractiveProps } from '../lib/interactives/module';
import { mazeLevels } from '../lib/interactives/factory-levels';
import SceneCanvas from '../lib/three/SceneCanvas';
import SceneLabel from '../lib/three/SceneLabel';
import MazeDiagram from '../components/lessons/MazeDiagram';

export default function Maze3D({
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const field =
    mazeLevels[Number(parameters.level ?? 0)]?.fields[
      Number(parameters.example ?? 0)
    ];
  if (!field) throw new RangeError('Неизвестное поле.');
  const row = Number(parameters.row ?? field.start.row),
    column = Number(parameters.column ?? field.start.column);
  const painted = Array.isArray(parameters.painted) ? parameters.painted : [];
  const cell = 4.5 / Math.max(field.rows, field.columns),
    x = (c: number) => (c - (field.columns - 1) / 2) * cell,
    z = (r: number) => (r - (field.rows - 1) / 2) * cell;
  const fallback = (
    <MazeDiagram
      field={field}
      position={{ row, column }}
      painted={painted
        .filter((i): i is number => typeof i === 'number')
        .map((i) => ({
          row: Math.floor(i / field.columns),
          column: i % field.columns,
        }))}
    />
  );
  return (
    <SceneCanvas
      cameraPosition={[4, 10, 6]}
      active={active}
      reducedMotion={reducedMotion}
      label={`Поле ${String(field.rows)} × ${String(field.columns)}. Робот: строка ${String(row + 1)}, столбец ${String(column + 1)}. Кресты — цели, насыщенные клетки — закрашены, стены непроходимы.`}
      fallback={fallback}
    >
      {(color, background) => (
        <group>
          {Array.from({ length: field.rows * field.columns }, (_, i) => {
            const r = Math.floor(i / field.columns),
              c = i % field.columns,
              target = field.targets.some((t) => t.row === r && t.column === c),
              filled = painted.includes(i);
            return (
              <group key={i}>
                <mesh position={[x(c), -0.15, z(r)]}>
                  <boxGeometry args={[cell * 0.92, 0.08, cell * 0.92]} />
                  <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={filled ? 1 : 0.08}
                    depthWrite={filled}
                  />
                </mesh>
                {target &&
                  [1, -1].map((sign) => (
                    <mesh
                      key={sign}
                      position={[x(c), -0.08, z(r)]}
                      rotation={[0, (sign * Math.PI) / 4, 0]}
                    >
                      <boxGeometry args={[cell * 0.45, 0.035, cell * 0.06]} />
                      <meshStandardMaterial
                        color={filled ? background : color}
                      />
                    </mesh>
                  ))}
              </group>
            );
          })}
          {Array.from({ length: field.rows + 1 }, (_, r) => (
            <mesh
              key={`grid-r${String(r)}`}
              position={[0, -0.095, (r - field.rows / 2) * cell]}
            >
              <boxGeometry args={[field.columns * cell, 0.015, cell * 0.02]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          {Array.from({ length: field.columns + 1 }, (_, c) => (
            <mesh
              key={`grid-c${String(c)}`}
              position={[(c - field.columns / 2) * cell, -0.095, 0]}
            >
              <boxGeometry args={[cell * 0.02, 0.015, field.rows * cell]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          {field.walls.map((wall, i) => (
            <mesh
              key={i}
              position={[
                (x(wall.from.column) + x(wall.to.column)) / 2,
                0.06,
                (z(wall.from.row) + z(wall.to.row)) / 2,
              ]}
            >
              <boxGeometry
                args={
                  wall.from.row === wall.to.row
                    ? [cell * 0.08, 0.25, cell]
                    : [cell, 0.25, cell * 0.08]
                }
              />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          {[0, field.rows].map((r) => (
            <mesh
              key={`r${String(r)}`}
              position={[0, 0.03, (r - field.rows / 2) * cell]}
            >
              <boxGeometry args={[field.columns * cell, 0.16, cell * 0.06]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          {[0, field.columns].map((c) => (
            <mesh
              key={`c${String(c)}`}
              position={[(c - field.columns / 2) * cell, 0.03, 0]}
            >
              <boxGeometry args={[cell * 0.06, 0.16, field.rows * cell]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          <mesh position={[x(column), 0.3, z(row)]}>
            <boxGeometry args={[cell * 0.45, 0.4, cell * 0.45]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <SceneLabel text="Р" position={[x(column), 0.65, z(row)]} />
        </group>
      )}
    </SceneCanvas>
  );
}
