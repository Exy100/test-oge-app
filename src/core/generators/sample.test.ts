import { expect, test } from 'vitest';
import { sampleTasks } from './sample';

test('samples contain real statements, answers, seeds and solutions', () => {
  const result = sampleTasks(1, 50, 'export');
  expect(result.match(/^## /gmu)).toHaveLength(50);
  expect(result.match(/\*\*Ответ:\*\*/gu)).toHaveLength(50);
  expect(result).toContain('export:49');
  expect(result).toContain('### Решение');
  expect(result).toBe(sampleTasks(1, 50, 'export'));
  expect(result).not.toBe(sampleTasks(1, 50, 'other'));
});
test('absent generators and invalid counts fail explicitly', () => {
  expect(() => sampleTasks(15, 50)).toThrow('нет зарегистрированных');
  for (const count of [0, -1, 0.5, 1001, Infinity])
    expect(() => sampleTasks(1, count)).toThrow();
});
