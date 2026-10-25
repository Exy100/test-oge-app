import type { InteractiveProps } from '../lib/interactives/module';
import {
  warehouseLevels,
  warehouseLoad,
  cargoBytes,
} from '../lib/interactives/games';
import SceneCanvas from '../lib/three/SceneCanvas';
import WarehouseDiagram from '../components/lessons/WarehouseDiagram';

export default function Warehouse3D({
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const level = warehouseLevels[Number(parameters.level ?? 0)];
  const counts = parameters.counts ?? [0, 0, 0];
  if (
    !level ||
    !Array.isArray(counts) ||
    counts.some((n) => typeof n !== 'number')
  )
    throw new RangeError('Проверь уровень и груз.');
  const quantities = counts as number[];
  const load = warehouseLoad(level, quantities);
  const scale = 5 / Math.max(level.capacity, load.bytes);
  return (
    <SceneCanvas
      active={active}
      reducedMotion={reducedMotion}
      label={`Склад: ${String(load.bytes)} из ${String(level.capacity)} байт. Каркас — общая вместимость склада; контейнеры за ним не помещаются. Размеры контейнеров пропорциональны байтам.`}
      fallback={<WarehouseDiagram level={level} counts={quantities} />}
    >
      {(color) => (
        <group>
          <mesh position={[-2.5 + (level.capacity * scale) / 2, 0, 0]}>
            <boxGeometry args={[level.capacity * scale, 1.1, 1.3]} />
            <meshStandardMaterial color={color} wireframe />
          </mesh>
          {level.cargo.map((cargo, row) => {
            const width = cargoBytes(cargo) * scale;
            const offset =
              level.cargo
                .slice(0, row)
                .reduce(
                  (sum, item, i) =>
                    sum + cargoBytes(item) * (quantities[i] ?? 0),
                  0,
                ) * scale;
            return Array.from({ length: quantities[row] ?? 0 }, (_, i) => (
              <mesh
                key={`${String(row)}:${String(i)}`}
                position={[-2.5 + offset + width * (i + 0.5), 0, 0]}
              >
                <boxGeometry
                  args={[width * 0.92, 0.9 - row * 0.08, 1.1 - row * 0.08]}
                />
                <meshStandardMaterial color={color} roughness={0.7} />
              </mesh>
            ));
          })}
        </group>
      )}
    </SceneCanvas>
  );
}
