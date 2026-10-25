import {
  Component,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createRoot,
  extend,
  useFrame,
  type ReconcilerRoot,
} from '@react-three/fiber';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { InteractiveRuntime } from '../interactives/runtime';
import './three.css';
// The default Canvas catalogue retains the entire namespace. Register only used objects.
extend({
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
});
class RenderBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
interface FrameSample {
  fps: number;
  geometries: number;
  textures: number;
}
function FrameMonitor({
  running,
  sample,
}: {
  running: boolean;
  sample: (value: FrameSample) => void;
}) {
  const meter = useRef({ start: 0, frames: 0 });
  useFrame(({ gl }) => {
    if (!running) {
      meter.current = { start: 0, frames: 0 };
      return;
    }
    const now = performance.now();
    if (!meter.current.start) meter.current.start = now;
    meter.current.frames++;
    const elapsed = now - meter.current.start;
    if (elapsed >= 1000) {
      sample({
        fps: Math.round((meter.current.frames * 1000) / elapsed),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
      meter.current = { start: now, frames: 0 };
    }
  });
  return null;
}
export default function SceneCanvas({
  active,
  reducedMotion,
  label,
  fallback,
  children,
}: InteractiveRuntime & {
  label: string;
  fallback: ReactNode;
  children: (color: string) => ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null);
  const [failed, setFailed] = useState(false);
  const [sample, setSample] = useState<FrameSample | null>(null);
  const fail = useCallback(() => {
    setFailed(true);
  }, []);
  const running = active && !reducedMotion;
  const redraw = useEffectEvent(() => {
    if (!stage.current || !root.current) return;
    root.current.render(
      <RenderBoundary onError={fail}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 6]} intensity={2} />
        {children(getComputedStyle(stage.current).color)}
        {import.meta.env.DEV && (
          <FrameMonitor running={running} sample={setSample} />
        )}
      </RenderBoundary>,
    );
  });
  const configure = useEffectEvent(() => {
    const surface = canvas.current;
    const view = stage.current;
    const renderer = root.current;
    if (!surface || !view || !renderer) return;
    const { top, left } = view.getBoundingClientRect();
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (!width || !height) return;
    void renderer
      .configure({
        size: {
          width,
          height,
          top: top + view.clientTop,
          left: left + view.clientLeft,
        },
        dpr: [1, 2],
        orthographic: true,
        camera: { position: [5, 4, 8], zoom: 42, near: 0.1, far: 100 },
        gl: { antialias: true, alpha: true, powerPreference: 'low-power' },
        flat: true,
        frameloop: running ? 'always' : 'demand',
        onCreated: () => {
          surface.dataset.threeReady = 'true';
        },
      })
      .then(() => {
        if (root.current === renderer) redraw();
      }, fail);
  });
  useEffect(() => {
    if (failed || !canvas.current || !stage.current) return;
    const surface = canvas.current;
    const renderer = createRoot(surface);
    root.current = renderer;
    function lost(event: Event) {
      event.preventDefault();
      fail();
    }
    surface.addEventListener('webglcontextlost', lost);
    const size = new ResizeObserver(() => {
      configure();
    });
    const theme = new MutationObserver(() => {
      redraw();
    });
    size.observe(stage.current);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    configure();
    return () => {
      root.current = null;
      size.disconnect();
      theme.disconnect();
      surface.removeEventListener('webglcontextlost', lost);
      // This root owns the renderer: R3F disposes objects and loses its context.
      renderer.unmount();
    };
  }, [failed, fail]);
  useEffect(() => {
    if (!failed) configure();
  }, [active, reducedMotion, children, failed]);
  if (failed)
    return (
      <div data-three-mode="fallback">
        <p role="status">
          Показана плоская схема. Продолжай расчёт на тех же полях.
        </p>
        {fallback}
        <button
          type="button"
          className="button"
          onClick={() => {
            setFailed(false);
          }}
        >
          Открыть объёмную схему ещё раз
        </button>
      </div>
    );
  return (
    <div
      ref={stage}
      className="three-stage"
      data-three-mode="webgl"
      data-three-running={running}
    >
      <canvas ref={canvas} role="img" aria-label={label} data-three-canvas />
      {import.meta.env.DEV && (
        <p className="three-meter" aria-hidden="true" data-three-meter>
          {running
            ? sample
              ? String(sample.fps) +
                ' кадров/с; геометрий: ' +
                String(sample.geometries) +
                '; текстур: ' +
                String(sample.textures)
              : 'Измерение частоты кадров…'
            : 'Пошаговый показ'}
        </p>
      )}
    </div>
  );
}
