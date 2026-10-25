import { readFile, readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { readLesson } from '../../scripts/quality/lessons.mjs';
import config from '../../coverage.config.ts';
import {
  officeExample,
  officeQuestion,
  officeGuidance,
  officeExamples,
  officeSources,
  officeArchiveHref,
} from '../../src/lib/lessons/office.ts';
import { lessonTask, shortQuestion } from '../../src/lib/lessons/content.ts';
import { checkLessonQuestion } from '../../src/lib/lessons/quiz.ts';
import {
  preparationLessons,
  preparationFor,
} from '../../src/lib/lessons/preparation.ts';
import { createTaskDataset } from '../../src/core/generators/task-dataset.ts';
import { verifyArchive } from '../../src/core/datasets/index.ts';
import { interactives } from '../../src/interactives/index.ts';
const course = [];
for (const section of ['i11', 'i12'])
  for (const file of await readdir('src/content/lessons/' + section)) {
    const path = 'src/content/lessons/' + section + '/' + file,
      source = await readFile(path, 'utf8');
    course.push({
      source,
      lesson: readLesson(path, source, config.lessons),
      path,
    });
  }
it('publishes six complete lessons with real scenes and full practical examples', () => {
  expect(course).toHaveLength(6);
  for (const { source, lesson } of course) {
    expect(lesson.findings).toEqual([]);
    expect(lesson.references).toHaveLength(
      lesson.data.id === 'sheet-selection' ? 2 : 1,
    );
    if (lesson.data.id === 'sheet-selection') {
      expect(lesson.references.map((reference) => reference.id)).toEqual([
        'spreadsheet-lab',
        'sorting-center',
      ]);
      expect(
        interactives.find((item) => item.id === 'sorting-center'),
      ).toMatchObject({
        kind: '3d',
        levels: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String) }),
        ]),
      });
      expect(
        interactives.find((item) => item.id === 'sorting-center').levels,
      ).toHaveLength(3);
    }
    expect(
      interactives.find((item) => item.id === lesson.references[0].id),
    ).toMatchObject({ kind: '2d' });
    const examples = source.match(/<Examples>[\s\S]*?<\/Examples>/u)?.[0] ?? '';
    const refs = [
      ...examples.matchAll(/source=\{officeExample\('([^']+)', (\d)\)\}/gu),
    ];
    expect(refs).toHaveLength(3);
    const tasks = refs.map(
      ([, family, index]) =>
        lessonTask(officeExample(family, Number(index))).task,
    );
    expect(
      tasks.every(
        (task) =>
          task.answer.type === 'artifact' && task.criteria && task.datasetId,
      ),
    ).toBe(true);
    expect(tasks.map((task) => task.difficulty)).toEqual(
      tasks.map((task) => task.difficulty).toSorted(),
    );
    const questions = [
      ...source.matchAll(/choice=\{officeQuestion\('([^']+)', (\d)\)\}/gu),
    ];
    expect(questions).toHaveLength(5);
    expect(officeGuidance(questions[0][1], 0).length).toBeGreaterThanOrEqual(5);
    for (const [, topic, index] of questions) {
      const question = officeQuestion(topic, Number(index));
      expect(checkLessonQuestion(question, 'correct').verdict).toBe('correct');
      expect(checkLessonQuestion(question, 'wrong').verdict).toBe('incorrect');
    }
  }
});
it.each(officeSources)(
  '$generatorId:$seed has real source, layout, editable reference and valid downloadable ZIP',
  async (source) => {
    const { task } = lessonTask(source);
    expect(() => shortQuestion(source)).toThrow('Мини-тест');
    const dataset = await createTaskDataset(task);
    await verifyArchive(dataset.manifest, dataset.archive);
    expect(officeArchiveHref(source)).toBe(
      '/test-oge-app/materials/files/office/' +
        source.generatorId +
        '.' +
        source.seed +
        '.zip',
    );
    for (const path of task.taskNumber === 14
      ? ['source/data.ods', 'reference/answer.ods', 'reference/answers.json']
      : task.variant13 === 'document'
        ? ['source/material.odt', 'layout/sample.pdf', 'reference/answer.odt']
        : ['source/material.odt', 'layout/slides.json', 'reference/answer.odp'])
      expect(dataset.files.has(path)).toBe(true);
  },
);
it('matches all preparation metadata and preserves the two alternatives of №13', () => {
  const links = preparationLessons.filter((link) =>
    ['i11', 'i12'].includes(link.section),
  );
  expect(links).toHaveLength(6);
  for (const link of links) {
    const entry = course.find((item) => item.lesson.data.id === link.id);
    expect(link.title).toBe(entry.lesson.data.title);
    expect(link.route).toBe(`/materials/${link.section}/${link.id}/`);
  }
  expect(preparationFor(13, 'document').map((link) => link.id)).toEqual([
    'document-paragraphs',
    'document-tables',
  ]);
  expect(preparationFor(13, 'presentation').map((link) => link.id)).toEqual([
    'presentation-layout',
  ]);
  expect(preparationFor(14, 'document')).toHaveLength(3);
  expect(preparationFor(14, 'presentation')).toHaveLength(3);
  expect(officeExamples.documents).toHaveLength(3);
  expect(officeExamples.presentations).toHaveLength(3);
  expect(officeExamples.sheets).toHaveLength(3);
});
