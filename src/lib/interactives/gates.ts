import { parseBoolean, booleanValue } from './logic.ts';
import { gateGoal, type GateLevel } from './gate-levels.ts';
export function gateComparison(level: GateLevel, source: string) {
  const expression = parseBoolean(source);
  const rows = [false, true].flatMap(a => [false, true].map(b => ({
    a, b, expected: gateGoal(level, a, b), actual: booleanValue(expression, a, b),
  })));
  return { rows, equivalent: rows.every(row => row.actual === row.expected) };
}
export function gateFeedback(level: GateLevel, source: string) {
  try {
    const result = gateComparison(level, source);
    const wrong = result.rows.find(row => row.actual !== row.expected);
    return { correct: result.equivalent, message: wrong
      ? 'Проверь A=' + String(Number(wrong.a)) + ', B=' + String(Number(wrong.b)) + ': требуется ' + (wrong.expected ? 'открыть' : 'закрыть') + ' проход, а выражение его ' + (wrong.actual ? 'открывает' : 'закрывает') + '.'
      : 'Верно: условие открывает и закрывает проход на всех четырёх наборах как требуется.' };
  } catch (cause) {
    return { correct: false, message: cause instanceof Error ? cause.message : 'Проверь выражение.' };
  }
}
