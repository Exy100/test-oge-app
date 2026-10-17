import { expect, test } from 'vitest';
import { testGenerator } from '../../../tests/generator-suite';
import {
  createRegistry,
  generators,
  getGenerator,
  generatorsForTask,
} from './index';
import { textVolume } from './01/text-volume';
import { learningGenerators, learningGeneratorsForTask } from './learning';
import { checkGeneratorSeed, type GeneratorChecks } from './quality';
import type { TaskInstance, TaskNumber } from '../types';

const checks: GeneratorChecks = {
  assertUnique(task) {
    const values = task.statement.match(/\d+/gu)?.map(Number);
    const [bits, count] = values ?? [];
    if (bits === undefined || count === undefined)
      throw new Error('Нет параметров.');
    const candidates = Array.from({ length: 1025 }, (_, bytes) => bytes).filter(
      (bytes) => (bytes * 8) / bits === count,
    );
    expect(candidates).toHaveLength(1);
    expect(task.answer).toEqual({
      type: 'integer',
      value: String(candidates[0]),
    });
  },
  assertQuality(task) {
    expect(task.answer.type).toBe('integer');
    if (task.answer.type === 'integer')
      expect(Number(task.answer.value)).toBeLessThanOrEqual(1024);
  },
};
testGenerator(textVolume, checks);

test('registry supports lookup and rejects duplicates', () => {
  const expectedCounts = [1, 3, 2, 1, 2, 3, 1, 2, 1, 1, 1, 1] as const;
  for (let i = 0; i < expectedCounts.length; i++) {
    const number = (i + 1) as TaskNumber;
    expect(generatorsForTask(number)).toHaveLength(expectedCounts[i] ?? 0);
    expect(learningGeneratorsForTask(number)).toHaveLength(
      number <= 10 ? 4 : 3,
    );
  }
  expect(getGenerator('removed-word-v2').id).toBe('removed-word-v2');
  expect(() => getGenerator(textVolume.id)).toThrow('не найден');
  expect(learningGenerators).toContainEqual(textVolume);
  expect(learningGenerators).toHaveLength(50);
  expect(
    generators.some((generator) =>
      learningGenerators.some(({ id }) => id === generator.id),
    ),
  ).toBe(false);
  expect(generatorsForTask(14)).toHaveLength(3);
  expect(generators).toHaveLength(33);
  expect(generatorsForTask(15).map((generator) => generator.id)).toEqual([
    'robot-corridor-v2',
    'robot-wall-gaps-v2',
    'robot-comb-v2',
    'robot-room-v2',
    'robot-corner-right-v2',
    'robot-corner-left-v2',
    'robot-stairs-v2',
  ]);
  expect(generatorsForTask(16)).toHaveLength(4);
  expect(generatorsForTask(13)).toEqual([]);
  expect(() => getGenerator('missing')).toThrow('не найден');
  expect(() => createRegistry([textVolume, textVolume])).toThrow();
  expect(() =>
    createRegistry([textVolume, { ...textVolume, id: 'other' }]),
  ).toThrow();
});

test.each([
  [
    'wrong answer',
    (task: TaskInstance) => ({
      ...task,
      answer: { type: 'integer' as const, value: '1' },
    }),
  ],
  ['invalid schema', (task: TaskInstance) => ({ ...task, statement: '' })],
  [
    'invalid formula',
    (task: TaskInstance) => ({
      ...task,
      solution: [
        { text: 'Формула', formula: '\\badcommand' },
        ...task.solution,
      ],
    }),
  ],
  ['missing files', (task: TaskInstance) => ({ ...task, datasetId: 'files' })],
  [
    'missing mistakes',
    (task: TaskInstance) => ({ ...task, commonMistakes: [] }),
  ],
  [
    'nonfinite text',
    (task: TaskInstance) => ({
      ...task,
      hints: ['NaN', ...task.hints.slice(1)] as [string, string, string],
    }),
  ],
])('harness rejects %s', (_, change) => {
  const broken = {
    ...textVolume,
    generate: (seed: string) => change(textVolume.generate(seed)),
  };
  expect(() => checkGeneratorSeed(broken, 'golden-1', checks)).toThrow();
});
test('detects nondeterminism, ambiguous domain, invalid figures and mutating verification', () => {
  let count = 0;
  expect(() =>
    checkGeneratorSeed(
      {
        ...textVolume,
        generate: (seed) => ({
          ...textVolume.generate(seed),
          id: String(count++),
        }),
      },
      '1',
      checks,
    ),
  ).toThrow('недетерминирован');
  expect(() =>
    checkGeneratorSeed(textVolume, '1', {
      ...checks,
      assertUnique: () => {
        throw new Error('Два ответа');
      },
    }),
  ).toThrow('Два ответа');
  expect(() =>
    checkGeneratorSeed(textVolume, '1', {
      ...checks,
      figures: () => [{ type: 'unknown' } as never],
    }),
  ).toThrow();
  expect(() =>
    checkGeneratorSeed(
      {
        ...textVolume,
        verify: (task) => {
          task.statement = 'Изменено';
          return true;
        },
      },
      '1',
      checks,
    ),
  ).toThrow('изменил');
});
