import { expect, type Page } from '@playwright/test';
import { generators } from '../../src/core/generators';
import { checkTaskAnswer } from '../../src/core/checker';
import { defaults, parseArea, PREFIX } from '../../src/core/storage/schemas';
import type { TaskInstance } from '../../src/core/types';

const candidate = generators
  .find((generator) => generator.taskNumber === 10)
  ?.generate('keyboard-start');
if (!candidate) throw new Error('Нет задания №10.');
export const first = candidate;
export function link(task: TaskInstance, numbers = String(task.taskNumber)) {
  return `stream/?${new URLSearchParams({ task: task.generatorId, seed: task.seed, numbers })}`;
}
export async function ready(page: Page) {
  await expect(page.locator('.stream-controls')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Что решать')).toBeEnabled();
}
export async function stats(page: Page) {
  const value: unknown = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown,
    PREFIX + 'streamStats',
  );
  return value === null
    ? defaults().streamStats
    : parseArea('streamStats', value);
}
export function current(page: Page): TaskInstance {
  const params = new URL(page.url()).searchParams;
  const generator = generators.find((item) => item.id === params.get('task'));
  const seed = params.get('seed');
  if (!generator || seed === null)
    throw new Error('Ссылка не содержит текущее задание.');
  return generator.generate(seed);
}
export function answer(task: TaskInstance, correct: boolean) {
  const expected = task.answer;
  if (expected.type === 'artifact')
    throw new Error('В сценарии нужен краткий ответ.');
  if (correct) return expected.value;
  const alternatives =
    expected.type === 'integer'
      ? [String(BigInt(expected.value) + 1n)]
      : expected.type === 'sequence'
        ? [
            ({ digits: '01', latin: 'AB', cyrillic: 'АБ' }[expected.alphabet]
              .split('')
              .find((symbol) => symbol !== expected.value[0]?.toUpperCase()) ??
              '') + expected.value.slice(1),
          ]
        : ['НЕСОВПАДЕНИЕ', '0', '1', 'А', 'Б', 'A', 'B', '123', 'ABC'];
  const wrong = alternatives.find(
    (raw) => checkTaskAnswer(task, raw).verdict === 'incorrect',
  );
  if (!wrong) throw new Error('Нет неверного ответа допустимого формата.');
  return wrong;
}
