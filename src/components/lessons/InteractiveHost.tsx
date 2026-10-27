import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInteractiveRuntime } from '../../lib/interactives/hooks';
import {
  type InteractiveModule,
  type InteractiveProps,
  type InteractiveValue,
} from '../../lib/interactives/module';
import { loadInteractivePath } from '../../lib/interactives/modules';
import { useHydrated } from '../useHydrated';

interface HostProps {
  id: string;
  modulePath: string;
  parameters: Readonly<Record<string, InteractiveValue>>;
}

const statusMessages = {
  paused: 'Пауза. Можно продолжить с того же места.',
  reduced: 'Анимация отключена. Используй пошаговое управление.',
  active: 'Интерактив готов к работе.',
  offscreen: 'Анимация приостановлена, пока интерактив не виден.',
} as const;

class InteractiveBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="interactive-error">
        <p role="status">
          Не удалось открыть интерактив. Попробуй ещё раз или прочитай текстовое
          объяснение ниже.
        </p>
        <button type="button" className="button" onClick={this.props.retry}>
          Загрузить ещё раз
        </button>
      </div>
    );
  }
}

function LoadedInteractive({
  modulePath,
  ...props
}: InteractiveProps & { modulePath: string }) {
  const [result, setResult] = useState<
    { module: InteractiveModule } | { failed: true } | null
  >(null);
  useEffect(() => {
    let mounted = true;
    void loadInteractivePath(modulePath).then(
      (module) => {
        if (mounted) setResult({ module });
      },
      () => {
        if (mounted) setResult({ failed: true });
      },
    );
    return () => {
      mounted = false;
    };
  }, [modulePath]);
  if (result && 'failed' in result)
    throw new Error('Interactive module failed');
  if (!result) return <p role="status">Загрузка интерактива…</p>;
  const View = result.module.default;
  return <View {...props} />;
}

export default function InteractiveHost({
  id,
  modulePath,
  parameters,
}: HostProps) {
  const ready = useHydrated();
  const target = useRef<HTMLDivElement>(null);
  const runtime = useInteractiveRuntime(target);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = runtime.active && !paused;
  return (
    <div
      ref={target}
      className="interactive-host"
      data-interactive-active={active}
      data-reduced-motion={runtime.reducedMotion}
    >
      <div className="interactive-toolbar">
        <button
          type="button"
          className="button"
          aria-pressed={paused}
          disabled={!ready}
          onClick={() => {
            setPaused((value) => !value);
          }}
        >
          Пауза
        </button>
        <p role="status" className="interactive-status">
          {Object.values(statusMessages).map((text) => (
            <span
              key={text}
              className="interactive-status-size"
              aria-hidden="true"
              data-status-text={text}
            />
          ))}
          <span>
            {paused
              ? statusMessages.paused
              : runtime.reducedMotion
                ? statusMessages.reduced
                : active
                  ? statusMessages.active
                  : statusMessages.offscreen}
          </span>
        </p>
      </div>
      <InteractiveBoundary
        key={`${modulePath}:${String(attempt)}`}
        retry={() => {
          setAttempt((value) => value + 1);
        }}
      >
        <LoadedInteractive
          id={id}
          modulePath={modulePath}
          parameters={parameters}
          active={active}
          reducedMotion={runtime.reducedMotion}
        />
      </InteractiveBoundary>
    </div>
  );
}
