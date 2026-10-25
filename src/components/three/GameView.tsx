import { useState, type ReactNode } from 'react';
import type { InteractiveProps } from '../../lib/interactives/module';
import ThreeScene from './ThreeScene';

export default function GameView({
  fallback,
  ...props
}: InteractiveProps & { modulePath: string; fallback: ReactNode }) {
  const [volume, setVolume] = useState(false);
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={volume}
          onChange={(event) => {
            setVolume(event.target.checked);
          }}
        />{' '}
        Объёмная игра
      </label>
      {volume ? <ThreeScene {...props} fallback={fallback} /> : fallback}
    </>
  );
}
