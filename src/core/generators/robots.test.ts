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
import { assessRobot, referenceProgram, robotPracticeScore } from './15/robots';
import {
  examTarget,
  examBarrier,
} from '../../../tests/fixtures/exam/robot-oracle';
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
  } else if (p.kind === 'robot-comb') {
    const bottom = Math.max(1, ...p.heights);
    for (let c = 0; c < p.heights.length; c++)
      for (let d = 0; d < (p.heights[c] ?? 0); d++)
        result.push(`${String(bottom - 1 - d)},${String(c)}`);
  } else {
    for (let r = 0; r < 25; r++)
      for (let c = 0; c < 30; c++)
        if (examTarget(p, r, c)) result.push(`${String(r)},${String(c)}`);
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
          p.kind === 'robot-corner-right' ||
          p.kind === 'robot-corner-left' ||
          p.kind === 'robot-stairs'
            ? examBarrier(p, r, c, nr)
            : p.kind === 'robot-wall-gaps'
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
test('exam families: all 100 independent rise/fall pairs and every interior gap in short joined walls', () => {
  for (let rise = 1; rise <= 10; rise++)
    for (let fall = 1; fall <= 10; fall++)
      checkCase({ kind: 'robot-stairs', rise, fall, top: 2, left: 2 });
  for (const kind of ['robot-corner-left', 'robot-corner-right'] as const)
    for (let width = 3; width <= 6; width++)
      for (let height = 3; height <= 6; height++)
        for (let holeX = 1; holeX < width - 1; holeX++)
          for (let holeWidth = 1; holeWidth < width - holeX; holeWidth++)
            for (let holeY = 1; holeY < height - 1; holeY++)
              for (
                let holeHeight = 1;
                holeHeight < height - holeY;
                holeHeight++
              )
                checkCase({
                  kind,
                  width,
                  height,
                  holeX,
                  holeWidth,
                  holeY,
                  holeHeight,
                  top: 2,
                  left: 2,
                });
  const stairs = {
    kind: 'robot-stairs' as const,
    rise: 1,
    fall: 1,
    top: 1,
    left: 1,
  };
  for (const invalid of [
    { ...stairs, rise: 0 },
    { ...stairs, fall: 11 },
    { ...stairs, top: 0 },
    { ...stairs, left: 1.5 },
  ])
    expect(() => fieldFor(invalid)).toThrow('параметры');
  expect(() =>
    fieldFor({
      kind: 'robot-corner-left',
      width: 3,
      height: 3,
      holeX: 1,
      holeY: 1,
      holeWidth: 2,
      holeHeight: 1,
      top: 1,
      left: 1,
    }),
  ).toThrow('параметры');
}, 30000);
test.each(Array.from({ length: 21 }, (_, i) => i))(
  'committed sample %i reproduces exact bytes',
  async (i) => {
    const generator = generatorsForTask(15)[i % 7];
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
  expect(score.score).toBe(0); // The 12-cell field has 11 missing, despite a passed 1-cell field.
  expect(score.passed).toBeGreaterThan(0);
  expect(score.passed).toBeLessThan(score.total);
});
test('partial criterion requires normal completion and at most ten extra AND ten missing on EVERY field', () => {
  const program = 'нц пока справа свободно\nвправо\nзакрасить\nкц'; // Misses only the start.
  const partial = assessRobot('robot-corridor', 'partial', program);
  expect(partial.score).toBe(1);
  expect(partial.passed).toBe(0);
  expect(partial.results.every((r) => r.missing === 1 && r.extra === 0)).toBe(
    true,
  );
  expect(assessRobot('robot-corridor', 'partial', 'влево').score).toBe(0);
  expect(
    assessRobot('robot-corridor', 'partial', 'нц 10000 раз\nзакрасить\nкц')
      .score,
  ).toBe(0);
  expect(assessRobot('robot-stairs', 'partial', '').score).toBe(0);
});
test('criterion boundaries: ten inclusive, eleven exclusive; a single failure invalidates partial credit', () => {
  const result = {
    status: 'completed' as const,
    success: false,
    extra: 0,
    missing: 0,
  };
  expect(robotPracticeScore([])).toBe(0);
  expect(robotPracticeScore([{ ...result, success: true }])).toBe(2);
  for (const [extra, missing, score] of [
    [10, 0, 1],
    [0, 10, 1],
    [10, 10, 1],
    [11, 0, 0],
    [0, 11, 0],
  ])
    expect(
      robotPracticeScore([
        { ...result, success: true },
        { ...result, extra: extra ?? 0, missing: missing ?? 0 },
      ]),
    ).toBe(score);
  for (const status of [
    'crashed',
    'cancelled',
    'step_limit',
    'running',
    'ready',
  ] as const)
    expect(robotPracticeScore([{ ...result, status }])).toBe(0);
});
