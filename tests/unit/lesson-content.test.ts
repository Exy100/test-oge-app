import { describe, expect, it } from 'vitest';
import { lessonTask, shortQuestion } from '../../src/lib/lessons/content';
import {
  checkLessonQuestion,
  validateChoice,
  type ChoiceQuestion,
} from '../../src/lib/lessons/quiz';
import {
  lessonStreamHref,
  prerequisiteLinks,
} from '../../src/lib/lessons/links';
import { documentTasks } from '../../src/core/banks';
import { parseStreamQuery } from '../../src/lib/stream-url';
import { parseGeneratedProblem } from '../fixtures/exam/parse-generated';
import { solveParameters } from '../fixtures/exam/solve-short';
import type { StreamReference } from '../../src/core/stream/schemas';

const sources: StreamReference[] = [
  {
    generatorId: 'removed-word-v2',
    taskNumber: 1,
    seed: 'lesson-content-word',
  },
  {
    generatorId: 'logic-count-true-v2',
    taskNumber: 3,
    seed: 'lesson-content-logic',
  },
  {
    generatorId: 'decode-prefix-v2',
    taskNumber: 2,
    seed: 'lesson-content-code',
  },
];
const choice: ChoiceQuestion = {
  kind: 'choice',
  prompt: 'Как проверить сохранение?',
  options: [
    { id: 'name', text: 'Прочитать имя' },
    { id: 'open', text: 'Открыть файл' },
  ],
  correctId: 'open',
  explanation: 'Открой файл и проверь содержимое.',
};

describe('lesson data and local checks', () => {
  it.each(sources)(
    'reproduces $generatorId and accepts an independently solved answer',
    (source) => {
      const first = lessonTask(source);
      expect(lessonTask(source)).toEqual(first);
      expect(first.task.seed).toBe(source.seed);
      expect(first.statementHtml).toContain('<p>');
      expect(first.steps.length).toBeGreaterThanOrEqual(3);
      expect(first.steps.every((step) => step.length > 0)).toBe(true);
      const answer = solveParameters(parseGeneratedProblem(first.task))?.[0];
      if (answer === undefined)
        throw new Error('Независимый решатель не дал ответ.');
      const question = shortQuestion(source);
      expect(checkLessonQuestion(question, answer).verdict).toBe('correct');
      expect(checkLessonQuestion(question, '').verdict).toBe('format_error');
      expect(
        checkLessonQuestion(
          question,
          first.task.answer.type === 'word' ? 'ошибка' : '99999999',
        ).verdict,
      ).not.toBe('correct');
    },
  );

  it('keeps curated file references and rejects file grading in a quiz', () => {
    const task = documentTasks[0];
    if (!task) throw new Error('Нет авторского набора.');
    const source = {
      generatorId: task.generatorId,
      taskNumber: task.taskNumber,
      seed: task.seed,
    };
    const example = lessonTask(source);
    expect(example.task).toEqual(task);
    expect(example.task.datasetId).toBeTruthy();
    expect(() => shortQuestion(source)).toThrow('по критериям');
  });
  it('rejects an unknown source instead of inventing an example', () => {
    expect(() =>
      lessonTask({ generatorId: 'unknown', taskNumber: 1, seed: 'test' }),
    ).toThrow();
  });
  it('requires a selection and distinguishes incorrect and corrected choices', () => {
    expect(checkLessonQuestion(choice, '').verdict).toBe('format_error');
    expect(checkLessonQuestion(choice, 'name')).toMatchObject({
      verdict: 'incorrect',
      message: choice.explanation,
    });
    expect(checkLessonQuestion(choice, 'open').verdict).toBe('correct');
    expect(checkLessonQuestion(choice, 'injected').verdict).toBe(
      'format_error',
    );
  });
  it.each([
    { ...choice, prompt: ' ' },
    { ...choice, explanation: '' },
    { ...choice, options: [] },
    { ...choice, correctId: 'missing' },
    {
      ...choice,
      options: [
        { id: 'open', text: 'A' },
        { id: 'open', text: 'B' },
      ],
    },
    {
      ...choice,
      options: [
        { id: 'open', text: ' ' },
        { id: 'other', text: 'B' },
      ],
    },
  ])('rejects malformed choice questions: %j', (question) => {
    expect(() => validateChoice(question)).toThrow();
  });
});

describe('lesson links', () => {
  it('round-trips filtered practice with the Pages base and an office branch', () => {
    const href = lessonStreamHref([13, 1, 13], 'document');
    expect(href).toBe(
      '/test-oge-app/stream/?numbers=1%2C13&variant13=document',
    );
    expect(
      parseStreamQuery(new URL(href, 'https://example.test').search, [])
        .filters,
    ).toMatchObject({ numbers: [1, 13], variant13: 'document' });
  });
  it.each([
    { numbers: [] },
    { numbers: [0] },
    { numbers: [17] },
    { numbers: [1.5] },
  ])('rejects invalid practice numbers: %j', ({ numbers }) => {
    expect(() => lessonStreamHref(numbers)).toThrow();
  });
  it('requires real prerequisite destinations and rejects external routes', () => {
    expect(
      prerequisiteLinks(
        ['bits'],
        [{ id: 'bits', title: 'Биты', route: '/materials/bits/' }],
      )[0]?.href,
    ).toBe('/test-oge-app/materials/bits/');
    expect(() => prerequisiteLinks(['missing'], [])).toThrow();
    expect(() =>
      prerequisiteLinks(
        ['bits'],
        [{ id: 'bits', title: 'Биты', route: 'https://example.test' }],
      ),
    ).toThrow();
  });
});
