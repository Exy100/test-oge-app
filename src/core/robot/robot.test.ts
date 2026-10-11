import { expect, test } from 'vitest';
import {
  RobotExecution,
  runRobot,
  compileRobot,
  robotLimits,
  RobotSyntaxError,
  type RobotField,
} from './index';
const field = (changes: Partial<RobotField> = {}): RobotField => ({
  kind: 'robot-field',
  description: 'Учебное поле',
  rows: 3,
  columns: 3,
  start: { row: 1, column: 1 },
  painted: [],
  targets: [],
  walls: [],
  ...changes,
});

test('two different solutions satisfy the same target without official grading', () => {
  const grid = field({
    targets: [
      { row: 1, column: 1 },
      { row: 1, column: 2 },
    ],
  });
  for (const program of [
    'закрасить\nвправо\nзакрасить',
    'вправо\nзакрасить\nвлево\nзакрасить',
  ]) {
    const result = runRobot(program, grid);
    expect(result.status).toBe('completed');
    expect(result.success).toBe(true);
    expect(result.painted).toEqual(grid.targets);
  }
  expect(runRobot('закрасить', grid).success).toBe(false);
  expect(runRobot('закрасить\nвлево\nзакрасить', grid).success).toBe(false);
});
test('moves in all directions, tracks source lines and keeps inputs/results isolated', () => {
  const grid = field();
  const execution = new RobotExecution(
    '| комментарий\nвверх\nвлево\nвниз\nвправо',
    grid,
  );
  grid.start.row = 0;
  expect(execution.snapshot().status).toBe('ready');
  const entry = execution.step();
  expect(entry).toMatchObject({
    step: 1,
    line: 2,
    position: { row: 0, column: 1 },
  });
  if (entry) entry.position.row = 99;
  const result = execution.run();
  expect(result.position).toEqual({ row: 1, column: 1 });
  expect(result.trace[0]?.position.row).toBe(0);
  result.position.row = 99;
  expect(execution.snapshot().position.row).toBe(1);
  expect(execution.step()).toBeNull();
  execution.cancel();
  expect(execution.snapshot().status).toBe('completed');
});
test.each(['вверх', 'вниз', 'влево', 'вправо'])(
  'boundary collision: %s',
  (command) => {
    const result = runRobot(
      command,
      field({ rows: 1, columns: 1, start: { row: 0, column: 0 } }),
    );
    expect(result.status).toBe('crashed');
    expect(result.success).toBe(false);
    expect(result.position).toEqual({ row: 0, column: 0 });
  },
);
test('internal walls block movement from both directions and sensors see them', () => {
  const wall = { from: { row: 1, column: 1 }, to: { row: 1, column: 2 } };
  const grid = field({ walls: [wall] });
  expect(runRobot('вправо', grid).status).toBe('crashed');
  expect(runRobot('влево', { ...grid, start: wall.to }).status).toBe('crashed');
  expect(
    runRobot('если справа стена то\nзакрасить\nиначе\nвправо\nвсе', grid)
      .painted,
  ).toEqual([grid.start]);
  expect(
    runRobot('если справа свободно то\nвправо\nиначе\nзакрасить\nвсе', grid)
      .painted,
  ).toEqual([grid.start]);
});
test.each(['сверху', 'снизу', 'слева', 'справа'])(
  'direction sensor %s and negation',
  (sensor) => {
    expect(
      runRobot(`если ${sensor} свободно то\nзакрасить\nвсе`, field()).painted,
    ).toHaveLength(1);
    expect(
      runRobot(`если не ${sensor} свободно то\nзакрасить\nвсе`, field())
        .painted,
    ).toHaveLength(0);
  },
);
test('paint sensors, prepainted cells, idempotence and wrappers', () => {
  const source =
    'использовать Робот\nалг пример\nнач\nесли клетка не закрашена то\nзакрасить\nвсе\nесли клетка закрашена то\nзакрасить\nвсе\nкон';
  const grid = field({
    painted: [{ row: 1, column: 1 }],
    targets: [{ row: 1, column: 1 }],
  });
  expect(runRobot(source, grid).success).toBe(true);
  expect(
    runRobot('если не клетка закрашена то\nзакрасить\nвсе', field()).painted,
  ).toHaveLength(1);
  expect(runRobot('использовать робот\nЗАКРАСИТЬ | конец', grid).success).toBe(
    true,
  );
});
test('while, nested repeats, zero repeats and empty programs terminate', () => {
  expect(
    runRobot('нц пока справа свободно\nвправо\nкц', field()).position.column,
  ).toBe(2);
  const program = 'нц 2 раз\nнц 3 раз\nзакрасить\nкц\nкц';
  const result = runRobot(program, field());
  expect(result.trace.filter((entry) => entry.action === 'paint')).toHaveLength(
    6,
  );
  expect(result.status).toBe('completed');
  expect(runRobot('нц 0 раз\nвверх\nкц', field()).steps).toBe(1);
  expect(runRobot('нц пока слева стена\nвлево\nкц', field()).steps).toBe(1);
  expect(runRobot('', field())).toMatchObject({
    status: 'completed',
    steps: 0,
    success: true,
  });
});
test('empty endless loops consume budget, trace is bounded and exact-budget completion wins', () => {
  const result = runRobot('нц пока сверху свободно\nкц', field(), {
    maxSteps: 9,
    traceLimit: 2,
  });
  expect(result).toMatchObject({
    status: 'step_limit',
    steps: 9,
    traceTruncated: true,
    success: false,
  });
  expect(result.trace).toHaveLength(2);
  expect(
    runRobot('закрасить', field(), { maxSteps: 1, traceLimit: 0 }),
  ).toMatchObject({
    status: 'completed',
    steps: 1,
    trace: [],
    traceTruncated: true,
  });
});
test('bounded batches permit cancellation between steps', () => {
  const execution = new RobotExecution('нц пока сверху свободно\nкц', field());
  expect(execution.run(3)).toMatchObject({ status: 'running', steps: 3 });
  execution.cancel();
  expect(execution.run()).toMatchObject({
    status: 'cancelled',
    steps: 3,
    success: false,
  });
  const cancelled = new RobotExecution('закрасить', field());
  cancelled.cancel();
  expect(cancelled.step()).toBeNull();
  expect(cancelled.snapshot().painted).toEqual([]);
});
test.each([
  'прыгать',
  'eval(1)',
  'если справа свободно\nвсе',
  'если непонятно то\nвсе',
  'если справа свободно то',
  'иначе',
  'все',
  'кц',
  'нц пока справа свободно',
  'нц 2 раз',
  'нц 10001 раз\nкц',
  'алг\nзакрасить\nкон',
  'алгоритм\nнач\nкон',
  'алг\nнач',
  'нач\nкон',
])('syntax error with line: %s', (source) => {
  expect(() => compileRobot(source)).toThrow(RobotSyntaxError);
  expect(() => compileRobot(source)).toThrow(/Строка \d+/u);
});
test('parse and field limits reject excessive input', () => {
  expect(() => compileRobot(' '.repeat(robotLimits.source + 1))).toThrow(
    'размер',
  );
  expect(() => compileRobot('\n'.repeat(robotLimits.lines))).toThrow('строк');
  expect(() =>
    compileRobot('нц 1 раз\n'.repeat(34) + 'кц\n'.repeat(34)),
  ).toThrow('вложенность');
  expect(() => runRobot('', field({ rows: 101 }))).toThrow();
  expect(() => runRobot('', field({ start: { row: 3, column: 0 } }))).toThrow();
  expect(() =>
    runRobot(
      '',
      field({
        painted: Array.from({ length: 10 }, () => ({ row: 0, column: 0 })),
      }),
    ),
  ).toThrow();
  for (const maxSteps of [0, -1, 1.5, 10001])
    expect(() => runRobot('', field(), { maxSteps })).toThrow();
  expect(() => runRobot('', field(), { traceLimit: 1001 })).toThrow();
  expect(() => new RobotExecution('', field()).run(0)).toThrow();
});
test('deterministic traces on repeated runs', () => {
  const source = 'нц 2 раз\nесли клетка не закрашена то\nзакрасить\nвсе\nкц';
  expect(runRobot(source, field())).toEqual(runRobot(source, field()));
});
