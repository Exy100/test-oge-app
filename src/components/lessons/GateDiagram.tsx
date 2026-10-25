export interface GateState {
  a: boolean;
  b: boolean;
  open: boolean;
  crossed: boolean;
}
export function gateDescription(state: GateState) {
  return (
    'A=' +
    String(Number(state.a)) +
    ', B=' +
    String(Number(state.b)) +
    '. Проход ' +
    (state.open ? 'открыт' : 'закрыт') +
    '. Ты ' +
    (state.crossed ? 'за воротами' : 'перед воротами') +
    '.'
  );
}
export default function GateDiagram(state: GateState) {
  return (
    <svg role="img" viewBox="0 0 340 210" aria-label={gateDescription(state)}>
      <title>Логические ворота</title>
      <path
        d="M100 30V185M240 30V185"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="85" y="90" width="20" height="24" fill="currentColor" />
      <rect x="235" y="90" width="20" height="24" fill="currentColor" />
      <rect
        x={state.open ? 45 : 105}
        y="97"
        width="65"
        height="10"
        fill="currentColor"
      />
      <rect
        x={state.open ? 230 : 170}
        y="97"
        width="65"
        height="10"
        fill="currentColor"
      />
      <text x="12" y="26" fill="currentColor">
        A={Number(state.a)}
      </text>
      <text x="260" y="26" fill="currentColor">
        B={Number(state.b)}
      </text>
      <text x="170" y="60" textAnchor="middle" fill="currentColor">
        {state.open ? 'Открыто' : 'Закрыто'}
      </text>
      <circle
        cx="170"
        cy={state.crossed ? 75 : 155}
        r="12"
        fill="var(--surface)"
        stroke="currentColor"
        strokeWidth="3"
      />
      <text
        x="170"
        y={state.crossed ? 80 : 160}
        textAnchor="middle"
        fill="currentColor"
      >
        Я
      </text>
    </svg>
  );
}
