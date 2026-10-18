import { expect, test } from 'vitest';
import { generators } from '../../src/core/generators';
import { checkTaskAnswer } from '../../src/core/checker';
import { answer } from '../fixtures/stream-answers';

test('journey answers include an accepted value and a counted wrong value for every short generator', () => {
  for (const generator of generators.filter((item) => item.taskNumber <= 10)) {
    for (let index = 0; index < 32; index += 1) {
      const task = generator.generate(`journey-answer-${String(index)}`);
      expect(checkTaskAnswer(task, answer(task, true)).verdict).toBe('correct');
      expect(checkTaskAnswer(task, answer(task, false)).verdict).toBe(
        'incorrect',
      );
    }
  }
});
