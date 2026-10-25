import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { readLesson } from '../../scripts/quality/lessons.mjs';
import config from '../../coverage.config.ts';
import { preparationLessons } from '../../src/lib/lessons/preparation.ts';
import { lessonTask, shortQuestion } from '../../src/lib/lessons/content.ts';
import { checkLessonQuestion } from '../../src/lib/lessons/quiz.ts';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated.ts';
import { solveParameters } from '../fixtures/exam/solve-short.ts';
import { interactives } from '../../src/interactives/index.ts';

const course = [];
for (const section of ['i1', 'i2'])
  for (const file of await readdir(`src/content/lessons/${section}`)) {
    const path = `src/content/lessons/${section}/${file}`;
    const source = await readFile(path, 'utf8');
    const lesson = readLesson(path, source, config.lessons);
    course.push({ path, source, lesson });
  }

describe('released information and coding lessons', () => {
  it('provides three complete lessons in each section and only real interactive references', () => {
    for (const section of ['i1', 'i2'])
      expect(
        course.filter(({ lesson }) => lesson.data.section === section),
      ).toHaveLength(3);
    for (const { lesson } of course) {
      expect(lesson.findings).toEqual([]);
      const withGame = lesson.data.id === 'bits-bytes';
      expect(lesson.references).toHaveLength(withGame ? 2 : 1);
      if (withGame)
        expect(lesson.references.map((reference) => reference.id)).toEqual([
          'bits-and-bytes',
          'bit-warehouse',
        ]);
      for (const reference of lesson.references) {
        const scene = interactives.find((scene) => scene.id === reference.id);
        expect(scene).toMatchObject({
          kind: reference.id === 'bit-warehouse' ? '3d' : '2d',
        });
        if (reference.id === 'bit-warehouse')
          expect(scene.levels).toHaveLength(3);
      }
    }
  });
  it.each(course)(
    '$path has reproducible examples, increasing difficulty, checked quizzes and a real exam format',
    ({ source }) => {
      const examples =
        source.match(/<Examples>[\s\S]*?<\/Examples>/u)?.[0] ?? '';
      const exampleSources = [
        ...examples.matchAll(
          /generatorId: '([^']+)',\s*taskNumber: ([12]),\s*seed: '([^']+)'/gu,
        ),
      ];
      const sources = [
        ...source.matchAll(
          /generatorId: '([^']+)',\s*taskNumber: ([12]),\s*seed: '([^']+)'/gu,
        ),
      ];
      expect(exampleSources).toHaveLength(3);
      expect(sources).toHaveLength(6);
      const difficulties = exampleSources.map(
        ([, generatorId, taskNumber, seed]) =>
          lessonTask({ generatorId, taskNumber: Number(taskNumber), seed }).task
            .difficulty,
      );
      expect(difficulties).toEqual(difficulties.toSorted());
      expect(difficulties.at(-1)).toBeGreaterThan(difficulties[0]);
      expect(exampleSources.some(([, id]) => id.endsWith('-v2'))).toBe(true);
      for (const [, generatorId, taskNumber, seed] of sources) {
        const reference = { generatorId, taskNumber: Number(taskNumber), seed };
        const { task, steps } = lessonTask(reference);
        expect(lessonTask(reference).task).toEqual(task);
        expect(steps.length).toBeGreaterThanOrEqual(3);
        expect(
          checkLessonQuestion(shortQuestion(reference), task.answer.value)
            .verdict,
        ).toBe('correct');
        if (generatorId.endsWith('-v2')) {
          const answers = solveParameters(parseGeneratedProblem(task));
          expect(answers).toContain(task.answer.value);
          for (const answer of answers)
            expect(
              checkLessonQuestion(shortQuestion(reference), answer).verdict,
            ).toBe('correct');
        }
      }
    },
  );
  it('keeps preparation links identical to real lesson metadata and routes', () => {
    const links = preparationLessons.filter((lesson) =>
      ['i1', 'i2'].includes(lesson.section),
    );
    expect(links).toHaveLength(course.length);
    for (const link of links) {
      const { lesson } = course.find(
        ({ lesson }) => lesson.data.id === link.id,
      );
      expect(link).toMatchObject({
        title: lesson.data.title,
        section: lesson.data.section,
      });
      expect(lesson.data.taskNumbers).toContain(link.taskNumber);
      expect(link.route).toBe(`/materials/${link.section}/${link.id}/`);
    }
  });
});
