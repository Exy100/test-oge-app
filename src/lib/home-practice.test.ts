import { expect, test } from 'vitest';
import { getGenerator } from '../core/generators';
import { checkTaskAnswer } from '../core/checker';
import { resolveStreamTask } from '../core/stream/catalog';
import { parseStreamQuery } from './stream-url';
import { homeTask, homeTopics, homeStreamLink } from './home-practice';

for (const topic of homeTopics) {
  test(`${topic.title}: home tasks replay through the shared registry and Stream URL`, () => {
    for (let index = 0; index < 16; index += 1) {
      const task = homeTask(topic.id, index);
      expect(task.taskNumber).toBe(topic.number);
      expect(getGenerator(task.generatorId).generate(task.seed)).toEqual(task);
      if (task.answer.type === 'artifact')
        throw new Error('Нужен краткий ответ.');
      expect(checkTaskAnswer(task, task.answer.value).verdict).toBe('correct');
      const url = new URL(homeStreamLink(task), 'https://exy100.github.io');
      expect(url.pathname).toBe('/test-oge-app/stream/');
      const query = parseStreamQuery(url.search, []);
      expect(query.filters.numbers).toEqual([topic.number]);
      if (!query.reference) throw new Error('Нет задания в ссылке.');
      expect(resolveStreamTask(query.reference)).toEqual(task);
    }
  });
}
test('home task indices are nonnegative safe integers', () => {
  for (const index of [-1, 0.5, Infinity, NaN])
    expect(() => homeTask('volume', index)).toThrow(RangeError);
});
