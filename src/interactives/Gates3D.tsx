import type { InteractiveProps } from '../lib/interactives/module';
import SceneCanvas from '../lib/three/SceneCanvas';
import SceneLabel from '../lib/three/SceneLabel';
import GateDiagram, { gateDescription } from '../components/lessons/GateDiagram';
export default function Gates3D({ parameters, active, reducedMotion }: InteractiveProps) {
  const state = { a: parameters.a === true, b: parameters.b === true, open: parameters.open === true, crossed: parameters.crossed === true };
  return <SceneCanvas active={active} reducedMotion={reducedMotion} label={gateDescription(state)} fallback={<GateDiagram {...state} />}>
    {color => <group>
      <mesh position={[0, -0.15, 0]}><boxGeometry args={[2.5, 0.1, 4]} /><meshStandardMaterial color={color} transparent opacity={0.12} /></mesh>
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[side * 1.1, 0.85, 0]}><boxGeometry args={[0.18, 1.8, 0.3]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[side * (state.open ? 1.5 : 0.5), 0.75, 0]}><boxGeometry args={[0.95, 1.5, 0.12]} /><meshStandardMaterial color={color} transparent opacity={0.5} /></mesh>
      </group>)}
      <mesh position={[0, 1.8, 0]}><boxGeometry args={[2.4, 0.15, 0.3]} /><meshStandardMaterial color={color} /></mesh>
      <SceneLabel text={state.open ? 'Открыто' : 'Закрыто'} position={[0, 2.25, 0]} />
      {[{ name: 'A', value: state.a, side: -1 }, { name: 'B', value: state.b, side: 1 }].map(input => <group key={input.name}>
        <mesh position={[input.side * 2, 0.1, 1]}><boxGeometry args={[0.4, 0.4, 0.4]} /><meshStandardMaterial color={color} wireframe={!input.value} /></mesh>
        <SceneLabel text={input.name + '=' + String(Number(input.value))} position={[input.side * 2, 0.55, 1]} />
      </group>)}
      <mesh position={[0, 0.25, state.crossed ? -1.5 : 1.5]}><boxGeometry args={[0.35, 0.55, 0.35]} /><meshStandardMaterial color={color} /></mesh>
      <SceneLabel text="Ты" position={[0, 0.75, state.crossed ? -1.5 : 1.5]} />
    </group>}
  </SceneCanvas>;
}
