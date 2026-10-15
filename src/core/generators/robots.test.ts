import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { generatorsForTask } from './index';
import { checkGeneratorSeed } from './quality';
import { createTaskDataset } from './task-dataset';
import { verifyArchive } from '../datasets';
import { FigureSpecSchema } from '../schemas';
import { runRobot } from '../robot';
import { robotCases, fieldFor, type RobotCase, isRobotKind } from './15/fields';
import { assessRobot, referenceProgram } from './15/robots';
function targets(p: RobotCase): string[] {
  const result: string[] = [];
  if (p.kind === 'robot-corridor') {
    for (let c = 0; c < p.length; c++)
      result.push(`${String(p.top)},${String(p.left + c)}`);
  } else if (p.kind === 'robot-room') {
    for (let r = 0; r < p.height; r++)
      for (let c = 0; c < p.width; c++)
        result.push(`${String(p.top + r)},${String(p.left + c)}`);
  } else if (p.kind === 'robot-wall-gaps') {
    for (let r = 0; r < p.height; r++)
      if (Math.floor(p.mask / 2 ** r) % 2 === 1)
        result.push(`${String(r)},${String(p.column)}`);
  } else {
    const bottom = Math.max(1, ...p.heights);
    for (let c = 0; c < p.heights.length; c++)
      for (let d = 0; d < (p.heights[c] ?? 0); d++)
        result.push(`${String(bottom - 1 - d)},${String(c)}`);
  }
  return result.sort();
}
function checkCase(p: RobotCase): void {
  const field = fieldFor(p);
  expect(FigureSpecSchema.parse(field)).toEqual(field);
  const expected = targets(p);
  expect(
    field.targets.map((c) => `${String(c.row)},${String(c.column)}`).sort(),
  ).toEqual(expected);
  const occupied = new Set(expected);
  if (p.kind === 'robot-comb')
    for (let c = 0; c < p.heights.length; c++)
      occupied.add(`${String(Math.max(1, ...p.heights))},${String(c)}`);
  const walls: string[] = [];
  const edge = (a: string, b: string) => [a, b].sort().join(':');
  for (let r = 0; r < field.rows; r++)
    for (let c = 0; c < field.columns; c++)
      for (const [dr = 0, dc = 0] of [
        [0, 1],
        [1, 0],
      ]) {
        const nr = r + dr,
          nc = c + dc;
        if (nr >= field.rows || nc >= field.columns) continue;
        const a = `${String(r)},${String(c)}`,
          b = `${String(nr)},${String(nc)}`;
        const barrier =
          p.kind === 'robot-wall-gaps'
            ? r === nr &&
              c === p.column - 1 &&
              Math.floor(p.mask / 2 ** r) % 2 === 1
            : occupied.has(a) !== occupied.has(b) ||
              (p.kind === 'robot-comb' &&
                r === nr &&
                r < Math.max(1, ...p.heights));
        if (barrier) walls.push(edge(a, b));
      }
  expect(
    field.walls
      .map((wall) =>
        edge(
          `${String(wall.from.row)},${String(wall.from.column)}`,
          `${String(wall.to.row)},${String(wall.to.column)}`,
        ),
      )
      .sort(),
  ).toEqual(walls.sort());
  const result = runRobot(referenceProgram(p.kind), field, {
    maxSteps: 5000,
    traceLimit: 0,
  });
  expect(result.status).toBe('completed');
  expect(
    result.painted.map((c) => `${String(c.row)},${String(c.column)}`).sort(),
  ).toEqual(expected);
  expect(result.success).toBe(true);
  expect(result.steps).toBeLessThan(2000);
}
for (const generator of generatorsForTask(15))
  describe(generator.id, () => {
    test.each([0, 1, 2, 3])(
      '500-seed campaign batch %i: families, exact independent targets, files, hashes and deterministic tasks',
      async (batch) => {
        const seeds =
          fc.sample(
            fc.uniqueArray(fc.string(), { minLength: 500, maxLength: 500 }),
            { seed: 20261015, numRuns: 1 },
          )[0] ?? [];
        expect(seeds).toHaveLength(500);
        expect(new Set(seeds).size).toBe(500);
        if (!isRobotKind(generator.subtype))
          throw new Error('Not a Robot subtype');
        for (const seed of seeds.slice(batch * 125, (batch + 1) * 125)) {
          const task = generator.generate(seed),
            dataset = await createTaskDataset(task);
          checkGeneratorSeed(generator, seed, {
            assertFiles() {
              for (const file of dataset.manifest.files) {
                const bytes = dataset.files.get(file.path);
                if (!bytes) throw new Error('Missing file');
                expect(createHash('sha256').update(bytes).digest('hex')).toBe(
                  file.sha256,
                );
                expect(file.license).toBe('CC0-1.0');
              }
              return [dataset.manifest];
            },
            assertUnique(task) {
              if (!isRobotKind(task.subtype)) throw new Error('Unknown Robot');
              const cases = robotCases(task.subtype, seed);
              expect(cases).toHaveLength(8);
              for (const p of cases) checkCase(p);
            },
            assertQuality(task) {
              expect(task.answer.type === 'artifact' && task.answer.kind).toBe(
                'robot',
              );
              expect(task.criteria?.levels.map((level) => level.score)).toEqual(
                [0, 1, 2],
              );
            },
          });
        }
      },
      60000,
    );
    test.each(['golden-1', 'golden-2', 'golden-3'])(
      'golden task and manifest %s',
      async (seed) => {
        const task = generator.generate(seed),
          dataset = await createTaskDataset(task);
        await verifyArchive(dataset.manifest, dataset.archive);
        expect(task).toMatchSnapshot();
        expect(dataset.manifest).toMatchSnapshot();
        expect((await createTaskDataset(task)).archive).toEqual(
          dataset.archive,
        );
      },
    );
    test('mutations, collisions, missing paint and infinite loops fail the family check', async () => {
      if (!isRobotKind(generator.subtype)) throw new Error('Unknown Robot');
      const kind = generator.subtype,
        task = generator.generate('negative'),
        program = referenceProgram(kind);
      expect(assessRobot(kind, 'negative', program).score).toBe(2);
      for (const source of [
        'вверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх\nвверх',
        'нц пока справа свободно\nкц',
        'несуществующая команда',
        program.replaceAll('закрасить', '| пропущена закраска'),
      ])
        expect(assessRobot(kind, 'negative', source).score).toBeLessThan(2);
      for (const changed of [
        { ...task, id: 'wrong' },
        { ...task, statement: 'wrong' },
        { ...task, datasetId: 'wrong' },
        { ...task, examPart: 1 as const },
        { ...task, answer: { type: 'integer' as const, value: '1' } },
      ]) {
        expect(generator.verify(changed)).toBe(false);
        await expect(createTaskDataset(changed)).rejects.toThrow();
      }
    });
  });
test('exhaustive short wall masks, comb profiles, corridor lengths and all room dimensions', () => {
  for (let h = 1; h <= 8; h++)
    for (let mask = 0; mask < 2 ** h; mask++)
      checkCase({
        kind: 'robot-wall-gaps',
        height: h,
        column: 2,
        rightPad: 1,
        mask,
      });
  for (let n = 1; n <= 4; n++)
    for (let code = 0; code < 4 ** n; code++)
      checkCase({
        kind: 'robot-comb',
        heights: Array.from(
          { length: n },
          (_, i) => Math.floor(code / 4 ** i) % 4,
        ),
      });
  for (let length = 1; length <= 12; length++)
    for (let left = 0; left <= 2; left++)
      checkCase({
        kind: 'robot-corridor',
        length,
        left,
        top: 1,
        rightPad: 2,
        bottomPad: 1,
      });
  for (let height = 1; height <= 12; height++)
    for (let width = 1; width <= 12; width++)
      checkCase({
        kind: 'robot-room',
        height,
        width,
        top: 1,
        left: 2,
        bottomPad: 1,
        rightPad: 1,
      });
}, 30000);
test.each(Array.from({ length: 12 }, (_, i) => i))(
  'committed sample %i reproduces exact bytes',
  async (i) => {
    const generator = generatorsForTask(15)[i % 4];
    if (!generator) throw new Error('Missing Robot');
    const dataset = await createTaskDataset(
      generator.generate(`robot-review:${String(i)}`),
    );
    expect(
      await readFile(
        `samples/15-files/${String(i + 1).padStart(2, '0')}/dataset.zip`,
      ),
    ).toEqual(Buffer.from(dataset.archive));
  },
);
test('rejects out-of-family dimensions and reports partial training success', () => {
  expect(() => fieldFor({ kind: 'robot-comb', heights: [] })).toThrow();
  expect(() =>
    fieldFor({
      kind: 'robot-room',
      height: 13,
      width: 1,
      top: 0,
      left: 0,
      bottomPad: 0,
      rightPad: 0,
    }),
  ).toThrow();
  expect(() =>
    fieldFor({
      kind: 'robot-wall-gaps',
      height: 1,
      column: 0,
      rightPad: 0,
      mask: 0,
    }),
  ).toThrow();
  const score = assessRobot('robot-corridor', 'partial', 'закрасить');
  expect(score.score).toBe(1);
  expect(score.passed).toBeGreaterThan(0);
  expect(score.passed).toBeLessThan(score.total);
});
