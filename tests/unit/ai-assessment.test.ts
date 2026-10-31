import { expect, test } from 'vitest';
import { readGrade } from '../../src/lib/ai/assessment-contract';
import { LocalStore } from '../../src/core/storage/store';
import { grantAiConsent, hasAiConsent } from '../../src/lib/ai/consent';

const grade = {
  kind: 'preliminary',
  score: 2,
  reason: 'Разбор',
  errors: [],
  advice: 'Проверь крайний случай.',
};
test.each([15, 16])(
  '№%i accepts only preliminary 0–2, never 3/null/office assistance',
  (n) => {
    for (const score of [0, 1, 2])
      expect(readGrade({ ...grade, score }, n).score).toBe(score);
    for (const score of [3, null, -1, 1.5, '2'])
      expect(() => readGrade({ ...grade, score }, n)).toThrow();
    expect(() =>
      readGrade({ ...grade, kind: 'criteria-help', score: null }, n),
    ).toThrow();
  },
);
test.each([13, 14])(
  '№%i permits assistance only; missing file is never zero',
  (n) => {
    expect(
      readGrade({ ...grade, kind: 'criteria-help', score: null }, n).score,
    ).toBeNull();
    for (const score of [0, 1, 2, 3])
      expect(() =>
        readGrade({ ...grade, kind: 'criteria-help', score }, n),
      ).toThrow();
    expect(() => readGrade(grade, n)).toThrow();
  },
);
test('grading boundary rejects extra fields, missing explanations and wrong task numbers', () => {
  expect(() => readGrade({ ...grade, reason: '' }, 16)).toThrow();
  expect(() => readGrade({ ...grade, extra: true }, 16)).toThrow();
  expect(() => readGrade(grade, 12)).toThrow();
});
test('consent is specific to each mode; old feedback grants do not authorise code or summaries', () => {
  const store = new LocalStore(() => {
    throw new Error('Storage unavailable');
  });
  store.write('aiConsent', {
    version: 1,
    enabled: true,
    policy: 'openrouter-feedback-v1',
  });
  expect(hasAiConsent(store)).toBe(true);
  expect(hasAiConsent(store, 'part2-grade')).toBe(false);
  expect(hasAiConsent(store, 'variant-summary')).toBe(false);
  grantAiConsent(store, 'part2-grade');
  expect(hasAiConsent(store)).toBe(true);
  expect(hasAiConsent(store, 'part2-grade')).toBe(true);
  expect(hasAiConsent(store, 'variant-summary')).toBe(false);
  store.write('aiConsent', { version: 1, enabled: false });
  grantAiConsent(store, 'variant-summary');
  expect(hasAiConsent(store, 'variant-summary')).toBe(true);
  expect(hasAiConsent(store)).toBe(false);
  expect(hasAiConsent(store, 'part2-grade')).toBe(false);
});
