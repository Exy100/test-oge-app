import type { InteractiveProps } from '../lib/interactives/module';
import SceneLabel from '../lib/three/SceneLabel';
import { packetLevels } from '../lib/interactives/games';
import SceneCanvas from '../lib/three/SceneCanvas';
import GraphDiagram from '../components/lessons/GraphDiagram';

export default function Packet3D({
  id,
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const level = packetLevels[Number(parameters.level ?? 0)],
    path = parameters.path ?? ['А'];
  if (
    !level ||
    !Array.isArray(path) ||
    path.some(
      (node) => typeof node !== 'string' || !level.graph.nodes.includes(node),
    )
  )
    throw new RangeError('Проверь уровень и маршрут.');
  const route = path as string[];
  const { graph } = level;
  const positions = graph.positions.map(({ x, y }) => ({
    x: (x - 210) / 70,
    y: (115 - y) / 55,
  }));
  return (
    <SceneCanvas
      active={active}
      reducedMotion={reducedMotion}
      label={`Сеть: ${graph.nodes.join(', ')}. Пакет в ${route.at(-1) ?? 'А'}. Заполнены посещённые узлы. Стрелки и разрешённые переходы перечислены под схемой. ${level.avoid ? `Узел ${level.avoid} закрыт и показан крестом.` : ''}`}
      fallback={
        <GraphDiagram
          id={`${id}-fallback`}
          {...graph}
          edges={graph.edges.map(([from, to]) => ({ from, to }))}
          selected={route}
          directed
        />
      }
    >
      {(color) => (
        <group>
          {graph.edges.map(([from, to]) => {
            const a = positions[graph.nodes.indexOf(from)],
              b = positions[graph.nodes.indexOf(to)];
            if (!a || !b) throw new Error('У узла нет координат.');
            const length = Math.hypot(b.x - a.x, b.y - a.y),
              angle = Math.atan2(b.y - a.y, b.x - a.x);
            const visited = route.some(
              (node, i) => node === from && route[i + 1] === to,
            );
            return (
              <group key={from + to}>
                <mesh
                  position={[(a.x + b.x) / 2, (a.y + b.y) / 2, 0]}
                  rotation={[0, 0, angle]}
                >
                  <boxGeometry
                    args={[length - 0.35, visited ? 0.07 : 0.025, 0.025]}
                  />
                  <meshStandardMaterial color={color} />
                </mesh>
                {[1, -1].map((side) => (
                  <mesh
                    key={side}
                    position={[
                      a.x + (b.x - a.x) * 0.76,
                      a.y + (b.y - a.y) * 0.76 + side * 0.025,
                      0,
                    ]}
                    rotation={[0, 0, angle + side * 0.65]}
                  >
                    <boxGeometry args={[0.16, 0.035, 0.04]} />
                    <meshStandardMaterial color={color} />
                  </mesh>
                ))}
              </group>
            );
          })}
          {graph.nodes.map((node, i) => {
            const pos = positions[i];
            if (!pos) throw new Error('У узла нет координат.');
            return (
              <group key={node} position={[pos.x, pos.y, 0]}>
                <SceneLabel text={node} position={[pos.x, pos.y - 0.3, 0]} />
                <mesh>
                  <boxGeometry args={[0.32, 0.32, 0.32]} />
                  <meshStandardMaterial
                    color={color}
                    wireframe={!route.includes(node)}
                  />
                </mesh>
                {node === level.avoid &&
                  [1, -1].map((side) => (
                    <mesh
                      key={side}
                      rotation={[0, 0, (side * Math.PI) / 4]}
                      position={[0, 0, 0.23]}
                    >
                      <boxGeometry args={[0.55, 0.07, 0.06]} />
                      <meshStandardMaterial color={color} />
                    </mesh>
                  ))}
                {node === route.at(-1) && (
                  <mesh position={[0, 0.38, 0]} rotation={[0, 0, Math.PI / 4]}>
                    <boxGeometry args={[0.2, 0.2, 0.2]} />
                    <meshStandardMaterial color={color} />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>
      )}
    </SceneCanvas>
  );
}
