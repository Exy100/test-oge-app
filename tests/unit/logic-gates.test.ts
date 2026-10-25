import { expect, it } from 'vitest';
import { gateLevels, gateGoal } from '../../src/lib/interactives/gate-levels';
import { gateComparison, gateFeedback } from '../../src/lib/interactives/gates';
import { interactives } from '../../src/interactives/index';
import config from '../../coverage.config';
const terms = ['(НЕ A И НЕ B)', '(НЕ A И B)', '(A И НЕ B)', '(A И B)'];
const masks = [8, 1, 6];
for (const [index, level] of gateLevels.entries()) {
  it(
    level.id + ': accepts exactly the target among all sixteen truth functions',
    () => {
      for (let mask = 0; mask < 16; mask++) {
        const expression =
          mask === 0
            ? 'A И НЕ A'
            : terms.filter((_, bit) => (mask & (1 << bit)) !== 0).join(' ИЛИ ');
        const comparison = gateComparison(level, expression);
        expect(comparison.rows.map((row) => row.actual)).toEqual(
          [0, 1, 2, 3].map((bit) => Boolean(mask & (1 << bit))),
        );
        expect(comparison.equivalent).toBe(mask === masks[index]);
        expect(gateFeedback(level, expression).correct).toBe(
          mask === masks[index],
        );
        for (const [bit, row] of comparison.rows.entries())
          expect(row.expected).toBe(Boolean((masks[index] ?? 0) & (1 << bit)));
      }
    },
  );
  it(level.id + ': rejects malformed and executable strings', () => {
    for (const source of [
      '',
      'A && B',
      'globalThis.alert(1)',
      'A И',
      '(',
      'A B',
      'A'.repeat(161),
    ]) {
      expect(gateFeedback(level, source).correct).toBe(false);
      expect(gateFeedback(level, source).message.length).toBeGreaterThan(10);
    }
  });
}
it('accepts equivalent forms, Cyrillic aliases and case', () => {
  const both = gateLevels[0],
    neither = gateLevels[1],
    exclusive = gateLevels[2];
  for (const source of ['B И A', 'не (не A или не B)', 'А И В'])
    expect(gateFeedback(both, source).correct).toBe(true);
  for (const source of ['НЕ (A ИЛИ B)', 'НЕ А И НЕ В'])
    expect(gateFeedback(neither, source).correct).toBe(true);
  for (const source of ['(A ИЛИ B) И НЕ (A И B)', '(A И НЕ B) ИЛИ (B И НЕ A)'])
    expect(gateFeedback(exclusive, source).correct).toBe(true);
  expect(
    gateComparison(exclusive, 'A ИЛИ B').rows.find((row) => row.a && !row.b),
  ).toMatchObject({ actual: true, expected: true });
  const wrong = gateFeedback(exclusive, 'A ИЛИ B');
  expect(wrong.correct).toBe(false);
  expect(wrong.message).toContain('A=1, B=1');
  expect(gateGoal(exclusive, true, true)).toBe(false);
});
it('Gate 8 requires the real eighteen 2D scenes and all five levelled games', () => {
  expect(config.interactives['2d'].minimum).toBe(18);
  expect(config.interactives['3d'].minimum).toBe(5);
  expect(config.interactives['3d'].levelsPerGame).toBe(3);
  for (const kind of ['2d', '3d'] as const)
    expect([...config.interactives[kind].requiredIds].sort()).toEqual(
      interactives
        .filter((scene) => scene.kind === kind)
        .map((scene) => scene.id)
        .sort(),
    );
  expect(
    interactives.find((scene) => scene.id === 'logic-gates'),
  ).toMatchObject({ kind: '3d', levels: gateLevels });
});
