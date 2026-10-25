import { useEffect, useRef, useState } from 'react';
import {
  useInteractiveAnimation,
  useInteractiveInterval,
} from '../lib/interactives/hooks';
import type { InteractiveProps } from '../lib/interactives/module';

/** A development-only exercise for the host's real listeners, timers and frames. */
export default function InteractiveProbe(props: InteractiveProps) {
  const [bits, setBits] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  const [width, setWidth] = useState(0);
  const dot = useRef<SVGCircleElement>(null);
  const phase = useRef(0);
  useEffect(() => {
    function resize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', resize);
    resize();
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);
  const running = { ...props, active: props.active && automatic };
  useInteractiveInterval(
    () => {
      setBits((value) => value + 1);
    },
    250,
    running,
  );
  useInteractiveAnimation((_timestamp, delta) => {
    phase.current = (phase.current + delta / 1000) % 1;
    dot.current?.setAttribute('cx', String(10 + phase.current * 180));
  }, running);
  if (props.parameters.fail === true)
    throw new Error('Проверка восстановления после ошибки отрисовки.');
  return (
    <div className="interactive-probe" data-probe-ready>
      <p data-probe-bits>{bits} бит</p>
      <p>
        {Math.floor(bits / 8)} полных байт, остаток {bits % 8} бит.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => {
          setBits((value) => value + 1);
        }}
      >
        Добавить бит
      </button>{' '}
      <button
        type="button"
        className="button"
        aria-pressed={automatic}
        onClick={() => {
          setAutomatic((value) => !value);
        }}
      >
        Автоматически
      </button>
      <svg viewBox="0 0 200 20" width="200" height="20" aria-hidden="true">
        <circle ref={dot} cx="10" cy="10" r="6" fill="currentColor" />
      </svg>
      <p>Ширина окна: {width} px.</p>
    </div>
  );
}
