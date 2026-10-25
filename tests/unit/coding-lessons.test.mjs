import { robotExample } from '../../src/core/generators/15/fields';
import { runRobot } from '../../src/core/robot';
import { readFile, readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { readLesson } from '../../scripts/quality/lessons.mjs';
import config from '../../coverage.config.ts';
import {
  codingExample,
  codingQuestion,
  codingSources,
  codingArchiveHref,
} from '../../src/lib/lessons/coding';
import { lessonTask, shortQuestion } from '../../src/lib/lessons/content';
import { checkLessonQuestion } from '../../src/lib/lessons/quiz';
import { preparationFor } from '../../src/lib/lessons/preparation';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { verifyArchive } from '../../src/core/datasets';
import { interactives } from '../../src/interactives';
const lessons = [];
for (const section of ['i13', 'i14'])
  for (const file of await readdir('src/content/lessons/' + section)) {
    const path = 'src/content/lessons/' + section + '/' + file,
      source = await readFile(path, 'utf8');
    lessons.push({ source, lesson: readLesson(path, source, config.lessons) });
  }
it('delivers seven complete lessons, 21 resolved artifacts and 35 locally checked understanding questions', () => {
  expect(lessons).toHaveLength(7);
  for (const { source, lesson } of lessons) {
    expect(lesson.findings).toEqual([]);
    expect(lesson.references).toHaveLength(
      lesson.data.id === 'robot-loops' ? 2 : 1,
    );
    if (lesson.data.id === 'robot-loops') {
      expect(lesson.references.map((reference) => reference.id)).toEqual([
        'robot-lab',
        'robot-maze',
      ]);
      expect(
        interactives.find((item) => item.id === 'robot-maze'),
      ).toMatchObject({
        kind: '3d',
        levels: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String) }),
        ]),
      });
      expect(
        interactives.find((item) => item.id === 'robot-maze').levels,
      ).toHaveLength(3);
    }
    expect(
      interactives.some((item) => item.id === lesson.references[0].id),
    ).toBe(true);
    expect(source.match(/<svg\b/gu)).toHaveLength(2);
    const refs = [
      ...source.matchAll(/source=\{codingExample\('([^']+)', (\d)\)\}/gu),
    ];
    expect(refs).toHaveLength(3);
    for (const [, topic, index] of refs) {
      const ref = codingExample(topic, Number(index));
      const { task } = lessonTask(ref);
      expect(task.answer.type).toBe('artifact');
      expect(task.solution).toHaveLength(3);
      expect(task.solution.at(-1).code).toBeTruthy();
      expect(() => shortQuestion(ref)).toThrow('Мини-тест');
    }
    const questions = [
      ...source.matchAll(/choice=\{codingQuestion\('([^']+)', (\d)\)\}/gu),
    ];
    expect(questions).toHaveLength(5);
    for (const [, topic, index] of questions) {
      const question = codingQuestion(topic, Number(index));
      expect(checkLessonQuestion(question, 'correct').verdict).toBe('correct');
      expect(checkLessonQuestion(question, 'wrong').verdict).toBe('incorrect');
      expect(question.options[0].text).not.toBe(question.options[1].text);
      if (lesson.data.taskNumbers.includes(15) && Number(index) === 4) {
        const ref = codingExample(topic, 1);
        const field = robotExample(ref.generatorId.slice(0, -3), ref.seed);
        const probe = runRobot(
          'если справа свободно то\nзакрасить\nвсе',
          field,
          { traceLimit: 0 },
        );
        expect(question.prompt).toContain('справа свободно');
        expect(question.options[0].text).toBe(
          probe.painted.length
            ? 'Да, справа свободно'
            : 'Нет, справа стена или край поля',
        );
      }
    }
  }
});
it.each(codingSources)(
  '$generatorId has a real, verified offline ZIP with code and validation',
  async (source) => {
    const { task } = lessonTask(source),
      dataset = await createTaskDataset(task);
    await verifyArchive(dataset.manifest, dataset.archive);
    expect(codingArchiveHref(source)).toMatch(
      /\/materials\/files\/coding\/.+\.zip$/u,
    );
    expect(
      [...dataset.files.keys()].some((path) =>
        /reference\/.+\.(txt|py)$/u.test(path),
      ),
    ).toBe(true);
    expect(
      [...dataset.files.keys()].some((path) =>
        path.startsWith(source.taskNumber === 15 ? 'validation/' : 'tests/'),
      ),
    ).toBe(true);
  },
);
it('adds every new title to result preparation and fills exactly the required course inventory', () => {
  for (const number of [15, 16]) {
    const links = preparationFor(number, 'document');
    expect(links).toHaveLength(number === 15 ? 3 : 4);
    for (const link of links)
      expect(
        lessons.some(
          ({ lesson }) =>
            lesson.data.id === link.id && lesson.data.title === link.title,
        ),
      ).toBe(true);
  }
  expect(interactives.filter((item) => item.kind === '2d')).toHaveLength(18);
  expect(
    codingArchiveHref({ ...codingSources[0], seed: 'unknown' }),
  ).toBeUndefined();
  expect(() => codingExample('commands', -1)).toThrow();
  expect(() => codingQuestion('testing', 5)).toThrow();
});
