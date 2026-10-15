import { expect, test } from 'vitest';
import { sampleTasks } from './sample';
import { generatorsForTask } from './index';

test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const)(
  'samples cover all four subtypes for task %i',
  (number) => {
    const sample = sampleTasks(number, 12, 'review');
    for (const generator of generatorsForTask(number)) {
      expect(sample.split(`Генератор: ${generator.id}`).length - 1).toBe(3);
    }
    expect(sample.match(/^## /gmu)).toHaveLength(12);
  },
);

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

test.each([11, 12] as const)(
  '№%i samples rotate through three subtypes and link archives',
  (taskNumber) => {
    const sample = sampleTasks(
      taskNumber,
      9,
      'files',
      `${String(taskNumber)}-files`,
    );
    for (const generator of generatorsForTask(taskNumber))
      expect(sample.split(`Генератор: ${generator.id}`).length - 1).toBe(3);
    expect(sample).toContain(
      `[Скачать ZIP](${String(taskNumber)}-files/01/dataset.zip)`,
    );
    expect(sample).toContain(
      `[Манифест](${String(taskNumber)}-files/09/manifest.json)`,
    );
    expect(sampleTasks(taskNumber, 1)).toContain('--files-dir');
  },
);
