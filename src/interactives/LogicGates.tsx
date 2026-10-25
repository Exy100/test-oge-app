import { useState } from 'react';
import type { InteractiveProps } from '../lib/interactives/module';
import { gateLevels, gateGoal } from '../lib/interactives/gate-levels';
import { gateComparison, gateFeedback } from '../lib/interactives/gates';
import { saveGameLevel } from '../lib/interactives/games';
import { browserStore } from '../core/storage/browser';
import GameLevels from '../components/lessons/GameLevels';
import GameView from '../components/three/GameView';
import GateDiagram, { gateDescription } from '../components/lessons/GateDiagram';
export default function LogicGates({ id, active, reducedMotion }: InteractiveProps) {
  const [selected, setSelected] = useState(0), [source, setSource] = useState('A');
  const [a, setA] = useState(false), [b, setB] = useState(false);
  const [crossed, setCrossed] = useState(false), [feedback, setFeedback] = useState('');
  const level = gateLevels[selected];
  if (!level) throw new RangeError('Неизвестный уровень ворот.');
  let comparison: ReturnType<typeof gateComparison> | undefined, error = '';
  try { comparison = gateComparison(level, source); }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Проверь выражение.'; }
  const expected = gateGoal(level, a, b);
  const current = comparison?.rows.find(row => row.a === a && row.b === b);
  const state = { a, b, open: current?.actual ?? false, crossed };
  function edit(value: string) { setSource(value); setCrossed(false); setFeedback(''); }
  function inputs(nextA: boolean, nextB: boolean) { setA(nextA); setB(nextB); setCrossed(false); setFeedback(''); }
  return <div className="information-lab">
    <p>Учебная игра по темам №3 и №6. Составь условие открытия прохода и проверь его для всех входов. A и B — независимые датчики: 1 означает «включён», 0 — «выключен».</p>
    <GameLevels id={id} gameId="logic-gates" lessonId="logic-operations" levels={gateLevels} selected={selected} onSelect={index => { setSelected(index); edit('A'); inputs(false, false); }} />
    <p>{level.goal}</p>
    <label htmlFor={id + '-expression'}>Условие открытия ворот</label>
    <input id={id + '-expression'} value={source} maxLength={160} spellCheck={false} autoCapitalize="off" onChange={event => { edit(event.target.value); }} aria-describedby={id + '-grammar'} />
    <p id={id + '-grammar'}>Используй A, B, НЕ, И, ИЛИ и скобки. Приоритет: скобки, НЕ, И, ИЛИ. Латинские A/B и похожие кириллические А/В принимаются одинаково.</p>
    <div className="interactive-toolbar">{['A', 'B', 'НЕ ', ' И ', ' ИЛИ ', '(', ')'].map(token => <button key={token} type="button" className="button" onClick={() => { edit(source + token); }}>Добавить {token.trim()}</button>)}<button type="button" className="button" onClick={() => { edit(''); }}>Очистить условие</button></div>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={a} onChange={event => { inputs(event.target.checked, b); }} /> Датчик A включён</label>
    <label><input type="checkbox" checked={b} onChange={event => { inputs(a, event.target.checked); }} /> Датчик B включён</label>
    <GameView id={id} active={active} reducedMotion={reducedMotion} modulePath="/src/interactives/Gates3D.tsx" parameters={state} fallback={<GateDiagram {...state} />} />
    <p role="status">{gateDescription(state)} По условию уровня требуется {expected ? 'открыть' : 'закрыть'} проход.</p>
    <button type="button" className="button" disabled={!comparison} onClick={() => {
      setCrossed(state.open);
      setFeedback(state.open ? (expected ? 'Ты прошёл. Проверь ещё остальные входы.' : 'Ты прошёл, хотя по условию проход должен быть закрыт. Исправь выражение.') : 'Проход закрыт. ' + (expected ? 'По условию он должен открываться: проверь выражение.' : 'Для этих входов это верно.'));
    }}>Испытать проход</button>
    {comparison && <div className="lab-table-scroll" tabIndex={0} role="region" aria-label="Все входы логических ворот"><table>
      <caption>Все четыре набора: 0 — закрыто, 1 — открыто</caption>
      <thead><tr><th scope="col">A</th><th scope="col">B</th><th scope="col">Нужно</th><th scope="col">Условие</th></tr></thead>
      <tbody>{comparison.rows.map(row => <tr key={String(row.a) + ':' + String(row.b)} data-current={row.a === a && row.b === b}><td>{Number(row.a)}</td><td>{Number(row.b)}</td><td>{Number(row.expected)}</td><td>{Number(row.actual)}</td></tr>)}</tbody>
    </table></div>}
    <button type="button" className="button button-dark" onClick={() => { const checked = gateFeedback(level, source); setFeedback(checked.message); if (checked.correct) saveGameLevel(browserStore(), 'logic-operations', 'logic-gates', level.id); }}>Проверить все входы</button>
    <p role="status">{feedback}</p>
  </div>;
}
