import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { observeInteractiveRuntime, type InteractiveRuntime } from './runtime';

export function useInteractiveRuntime(
  target: RefObject<HTMLElement | null>,
): InteractiveRuntime {
  const [runtime, setRuntime] = useState<InteractiveRuntime>({
    active: false,
    reducedMotion: true,
  });
  useEffect(() => {
    if (target.current)
      return observeInteractiveRuntime(target.current, setRuntime);
  }, [target]);
  return runtime;
}

/** Automatic changes stop on pause or reduced motion; manual controls stay usable. */
export function useInteractiveInterval(
  callback: () => void,
  milliseconds: number,
  { active, reducedMotion }: InteractiveRuntime,
) {
  const tick = useEffectEvent(callback);
  useEffect(() => {
    if (!active || reducedMotion) return;
    const timer = window.setInterval(() => {
      tick();
    }, milliseconds);
    return () => {
      window.clearInterval(timer);
    };
  }, [active, reducedMotion, milliseconds]);
}

/** Delta starts at zero after every resume, so a background tab cannot cause a jump. */
export function useInteractiveAnimation(
  callback: (timestamp: number, delta: number) => void,
  { active, reducedMotion }: InteractiveRuntime,
) {
  const frame = useEffectEvent(callback);
  useEffect(() => {
    if (!active || reducedMotion) return;
    let previous: number | undefined;
    let request: number;
    function animate(timestamp: number) {
      frame(timestamp, previous === undefined ? 0 : timestamp - previous);
      previous = timestamp;
      request = window.requestAnimationFrame(animate);
    }
    request = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(request);
    };
  }, [active, reducedMotion]);
}
