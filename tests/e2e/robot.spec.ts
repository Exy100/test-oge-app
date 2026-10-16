import { expect, test } from '@playwright/test';
import { runRobot, type RobotField } from '../../src/core/robot';

const field: RobotField = {
  kind: 'robot-field',
  description: 'Проверка исполнителя',
  rows: 2,
  columns: 3,
  start: { row: 0, column: 0 },
  painted: [],
  targets: [
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
  ],
  walls: [],
};
const sources = [
  'закрасить\nнц пока справа свободно\nвправо\nзакрасить\nкц',
  'вверх',
  'нц пока справа свободно\nкц',
  'нц 2 раз\nесли клетка не закрашена то\nзакрасить\nиначе\nвправо\nвсе\nкц',
  'если (справа свободно) и (не сверху свободно) то\nзакрасить\nвсе\nнц пока справа свободно и не (снизу стена или справа стена)\nвправо\nзакрасить\nкц',
];

test('Robot produces identical Node and browser traces; batches can be cancelled', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/');
  const actual = await page.evaluate(
    async ({ field, sources }) => {
      const modulePath = '/test-oge-app/src/core/robot/index.ts';
      const { runRobot, RobotExecution } = (await import(
        /* @vite-ignore */ modulePath
      )) as typeof import('../../src/core/robot');
      const results = sources.map((source) =>
        runRobot(source, field, { maxSteps: 30, traceLimit: 20 }),
      );
      const execution = new RobotExecution(sources[2] ?? '', field);
      execution.run(5);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      execution.cancel();
      return { results, cancelled: execution.run() };
    },
    { field, sources },
  );
  expect(actual.results).toEqual(
    sources.map((source) =>
      runRobot(source, field, { maxSteps: 30, traceLimit: 20 }),
    ),
  );
  expect(actual.cancelled).toMatchObject({
    status: 'cancelled',
    steps: 5,
    success: false,
  });
});

test('all seven generated Robot references produce identical family results in Node and browsers', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/');
  const actual = await page.evaluate(async () => {
    const path = '/test-oge-app/src/core/generators/15/robots.ts';
    const { robotGenerators, assessRobot, referenceProgram } = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../../src/core/generators/15/robots');
    const fields = '/test-oge-app/src/core/generators/15/fields.ts';
    const { robotKinds } = (await import(
      /* @vite-ignore */ fields
    )) as typeof import('../../src/core/generators/15/fields');
    return {
      tasks: robotGenerators.map((generator) => generator.generate('browser')),
      results: robotKinds.map((kind) =>
        assessRobot(kind, 'browser', referenceProgram(kind)),
      ),
    };
  });
  const { robotGenerators, assessRobot, referenceProgram } =
    await import('../../src/core/generators/15/robots');
  const { robotKinds } = await import('../../src/core/generators/15/fields');
  expect(actual).toEqual({
    tasks: robotGenerators.map((generator) => generator.generate('browser')),
    results: robotKinds.map((kind) =>
      assessRobot(kind, 'browser', referenceProgram(kind)),
    ),
  });
  expect(actual.results.every((result) => result.score === 2)).toBe(true);
});
