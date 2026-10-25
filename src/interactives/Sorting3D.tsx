import type { InteractiveProps } from '../lib/interactives/module';
import { sortingLevels } from '../lib/interactives/factory-levels';
import SceneCanvas from '../lib/three/SceneCanvas';
import SceneLabel from '../lib/three/SceneLabel';
import SortingDiagram from '../components/lessons/SortingDiagram';

export default function Sorting3D({
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const level = sortingLevels[Number(parameters.level ?? 0)];
  const routes = parameters.routes ?? Array.from({ length: 8 }, () => null),
    current = Number(parameters.current ?? 0);
  if (
    !level ||
    !Array.isArray(routes) ||
    routes.length !== 8 ||
    routes.some((v) => v !== true && v !== false && v !== null)
  )
    throw new RangeError('Проверь распределение посылок.');
  const decisions = routes as (boolean | null)[];
  return (
    <SceneCanvas
      active={active}
      reducedMotion={reducedMotion}
      label={`Сортировочный центр. Сейчас посылка №${String(current + 1)}. Три ряда: не распределены, отбор, остальные. Номера на коробках совпадают с таблицей.`}
      fallback={
        <SortingDiagram
          parcels={level.parcels}
          routes={decisions}
          current={current}
        />
      }
    >
      {(color) => (
        <group>
          {['Не распределены', 'Отбор', 'Остальные'].map((title, lane) => (
            <group key={title}>
              <mesh position={[0, 1.18 - lane * 1.5, 0]}>
                <boxGeometry args={[5.5, 0.1, 0.65]} />
                <meshStandardMaterial color={color} />
              </mesh>
              <SceneLabel text={title} position={[0, 1.95 - lane * 1.5, 0]} />
            </group>
          ))}
          {level.parcels.map((parcel, i) => {
            const decision = decisions[i],
              lane = decision === null ? 0 : decision ? 1 : 2;
            const siblings = level.parcels.filter(
              (_, j) => decisions[j] === decision,
            );
            const index = siblings.findIndex((item) => item.id === parcel.id),
              x = (index - (siblings.length - 1) / 2) * 0.62,
              y = 1.5 - lane * 1.5;
            return (
              <group key={parcel.id}>
                <mesh
                  position={[x, y, 0.1]}
                  rotation={[0, 0, i === current ? 0.15 : 0]}
                >
                  <boxGeometry args={[0.45, 0.45, 0.45]} />
                  <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={i === current ? 1 : 0.32}
                    depthWrite={i === current}
                  />
                </mesh>
                <SceneLabel text={String(parcel.id)} position={[x, y, 0.5]} />
              </group>
            );
          })}
        </group>
      )}
    </SceneCanvas>
  );
}
