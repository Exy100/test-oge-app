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

test('file samples rotate through three subtypes and link archives', () => {
  const sample = sampleTasks(11, 9, 'files', '11-files');
  for (const generator of generatorsForTask(11))
    expect(sample.split(`Генератор: ${generator.id}`).length - 1).toBe(3);
  expect(sample).toContain('[Скачать ZIP](11-files/01/dataset.zip)');
  expect(sample).toContain('[Манифест](11-files/09/manifest.json)');
  expect(sampleTasks(11, 1)).toContain('--files-dir');
});

test('file selection samples rotate through four subtypes', () => {
  const sample = sampleTasks(12, 8, 'selection', '12-files');
  for (const generator of generatorsForTask(12))
    expect(sample.split(`Генератор: ${generator.id}`).length - 1).toBe(2);
  expect(sample).toContain('[Скачать ZIP](12-files/01/dataset.zip)');
  expect(sample).toContain('[Манифест](12-files/08/manifest.json)');
});
