import { expect, type Page } from '@playwright/test';
import { generators } from '../../src/core/generators';
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
export { answer } from './stream-answers';
