import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Center } from '@react-three/drei/core/Center.js';
import type { Group } from 'three';
import type { InteractiveProps } from '../lib/interactives/module';
import { byteGroups } from '../lib/interactives/information';
import SceneCanvas from '../lib/three/SceneCanvas';
import BitCells from '../components/lessons/BitCells';
function Cells({
  remainder,
  color,
  active,
  reducedMotion,
}: { remainder: number; color: string } & Pick<
  InteractiveProps,
  'active' | 'reducedMotion'
>) {
  const group = useRef<Group>(null);
  const phase = useRef(0);
  useFrame((_state, delta) => {
    if (group.current && active && !reducedMotion) {
      phase.current += Math.min(delta, 0.05) * 0.4;
      group.current.rotation.y = Math.sin(phase.current) * 0.12;
    }
  });
  return (
    <group ref={group}>
      <Center>
        {Array.from({ length: 8 }, (_, index) => (
          <mesh
            key={index}
            position={[(index % 4) * 1.1, Math.floor(index / 4) * 1.1, 0]}
          >
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial
              color={color}
              wireframe={index >= remainder}
              roughness={0.7}
            />
          </mesh>
        ))}
      </Center>
    </group>
  );
}
/** A working base visualization, outside the five-game level inventory. */
export default function BitCells3D({
  id,
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const bits = typeof parameters.bits === 'number' ? parameters.bits : 19;
  const { remainder } = byteGroups(bits);
  return (
    <SceneCanvas
      active={active}
      reducedMotion={reducedMotion}
      label={
        'Восемь битовых ячеек. Остаток заполняет ' +
        String(remainder) +
        ' из восьми.'
      }
      fallback={<BitCells id={id + '-fallback'} bits={bits} />}
    >
      {(color) => (
        <Cells
          color={color}
          remainder={remainder}
          active={active}
          reducedMotion={reducedMotion}
        />
      )}
    </SceneCanvas>
  );
}
