import { describe, expect, it } from 'vitest';
import {
  binaryPlaces,
  checkPracticeAnswer,
  makePracticeTask,
  practiceSize,
  practiceTopics,
} from './practice';

describe('базовая практика', () => {
  for (const topic of practiceTopics) {
    it(`${topic.title}: все экземпляры воспроизводимы и цикл не теряет задачи`, () => {
      const tasks = Array.from({ length: practiceSize(topic.id) }, (_, index) =>
        makePracticeTask(topic.id, index),
      );
      expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
      expect(new Set(tasks.map((task) => task.question)).size).toBe(
        tasks.length,
      );
      for (const [index, task] of tasks.entries()) {
        expect(makePracticeTask(topic.id, index)).toEqual(task);
        expect(makePracticeTask(topic.id, index + tasks.length)).toEqual(task);
        expect(task.hints).toHaveLength(3);
        expect(task.steps).toHaveLength(3);
        expect(checkPracticeAnswer(task, String(task.answer))).toBe('correct');
        expect(checkPracticeAnswer(task, String(task.answer + 1))).toBe(
          'incorrect',
        );
        if (task.topic === 'volume') {
          expect(task.answer * 8).toBe(task.characters * task.bits);
          expect(task.question).toContain(`${String(task.bits)} бит`);
          expect(task.question).toContain(
            `${String(task.characters)} символов`,
          );
        } else if (task.topic === 'binary') {
          expect(task.answer).toBe(Number.parseInt(task.digits, 2));
          expect(
            binaryPlaces(task.digits).reduce(
              (sum, place) => sum + Number(place.digit) * place.weight,
              0,
            ),
          ).toBe(task.answer);
          expect(task.question).toContain(task.digits);
        } else {
          const allowed = Array.from(
            { length: task.upper + 3 },
            (_, value) => value,
          ).filter(
            (value) =>
              (task.lowerInclusive
                ? value >= task.lower
                : value > task.lower) &&
              (task.upperInclusive ? value <= task.upper : value < task.upper),
          );
          expect(task.answer).toBe(
            task.find === 'min' ? Math.min(...allowed) : Math.max(...allowed),
          );
          expect(task.question).toContain(
            task.lowerInclusive
              ? `НЕ (X < ${String(task.lower)})`
              : `(X > ${String(task.lower)})`,
          );
          expect(task.question).toContain(
            `(X ${task.upperInclusive ? '≤' : '<'} ${String(task.upper)})`,
          );
          expect(task.question).toContain(
            task.find === 'min' ? 'наименьшее' : 'наибольшее',
          );
        }
        expect(task.steps[2]).toContain(String(task.answer));
      }
    });
  }

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет недопустимый номер %s',
    (index) => {
      expect(() => makePracticeTask('volume', index)).toThrow(RangeError);
    },
  );

  it.each(['48', ' 48 ', '+48', '00048', '+00048', '\t48\n'])(
    'принимает целый ответ %j',
    (answer) => {
      expect(checkPracticeAnswer(makePracticeTask('volume', 0), answer)).toBe(
        'correct',
      );
    },
  );

  it.each([
    '',
    ' ',
    '48 байт',
    '4 8',
    '48.0',
    '48,0',
    '4.8e1',
    '0x30',
    '--48',
    '１２',
    '1'.repeat(33),
  ])('отклоняет неподходящий формат %j', (answer) => {
    expect(checkPracticeAnswer(makePracticeTask('volume', 0), answer)).toBe(
      'invalid',
    );
  });

  it.each(['0', '-48', '49', '9'.repeat(32)])(
    'различает ошибочный целый ответ %j',
    (answer) => {
      expect(checkPracticeAnswer(makePracticeTask('volume', 0), answer)).toBe(
        'incorrect',
      );
    },
  );
});
