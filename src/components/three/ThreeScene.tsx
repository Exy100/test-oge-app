import { Component, useEffect, useState, type ReactNode } from 'react';
import type { InteractiveModule, InteractiveProps } from '../../lib/interactives/module';
import { loadInteractivePath } from '../../lib/interactives/modules';
import { supportsWebGL2 } from '../../lib/three/capability';
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function LoadedScene({ modulePath, ...props }: InteractiveProps & { modulePath: string }) {
  const [result, setResult] = useState<InteractiveModule | 'failed' | null>(null);
  useEffect(() => {
    let mounted = true;
    void loadInteractivePath(modulePath).then(
      (module) => { if (mounted) setResult(module); },
      () => { if (mounted) setResult('failed'); },
    );
    return () => { mounted = false; };
  }, [modulePath]);
  if (result === 'failed') throw new Error('Не удалось загрузить объёмную схему.');
  if (!result) return <p role="status">Загрузка объёмной схемы…</p>;
  const View = result.default;
  return <View {...props} />;
}
/** Do not request the heavy entry before an explicit choice and WebGL2 detection. */
export default function ThreeScene({ modulePath, fallback, ...props }: InteractiveProps & { modulePath: string; fallback: ReactNode }) {
  const [supported] = useState(supportsWebGL2);
  const [attempt, setAttempt] = useState(0);
  const alternative = (
    <div data-three-mode="fallback">
      <p role="status">Показана плоская схема. Расчёт доступен на тех же полях.</p>
      {fallback}
      {supported && <button type="button" className="button" onClick={() => { setAttempt((value) => value + 1); }}>Повторить загрузку схемы</button>}
    </div>
  );
  if (!supported) return alternative;
  return <SceneBoundary key={modulePath + ':' + String(attempt)} fallback={alternative}><LoadedScene modulePath={modulePath} {...props} /></SceneBoundary>;
}
