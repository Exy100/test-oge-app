import type { Rng } from '../../rng.ts';
import type { RobotField } from '../../robot/index.ts';

export const examRobotKinds = [
  'robot-corner-right',
  'robot-corner-left',
  'robot-stairs',
] as const;
export type ExamRobotKind = (typeof examRobotKinds)[number];
type CornerParameters = {
  width: number;
  height: number;
  holeX: number;
  holeWidth: number;
  holeY: number;
  holeHeight: number;
  top: number;
  left: number;
};
export type ExamRobotCase =
  | ({ kind: 'robot-corner-right' } & CornerParameters)
  | ({ kind: 'robot-corner-left' } & CornerParameters)
  | {
      kind: 'robot-stairs';
      rise: number;
      fall: number;
      top: number;
      left: number;
    };

export function examField(p: ExamRobotCase): RobotField {
  const integer = (value: number, min: number, max: number) => {
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(
        'Недопустимые параметры экзаменационного семейства Робота.',
      );
  };
  integer(p.top, 1, 3);
  integer(p.left, 1, 3);
  const walls = new Map<string, RobotField['walls'][number]>();
  const targets = new Map<string, RobotField['start']>();
  const target = (row: number, column: number) =>
    targets.set(`${String(row)},${String(column)}`, { row, column });
  const wall = (row: number, column: number, dr: number, dc: number) => {
    const from = { row, column },
      to = { row: row + dr, column: column + dc };
    walls.set(`${String(row)},${String(column)},${String(dr)},${String(dc)}`, {
      from,
      to,
    });
  };
  let rows: number, columns: number, start: RobotField['start'];
  if (p.kind === 'robot-stairs') {
    integer(p.rise, 1, 10);
    integer(p.fall, 1, 10);
    rows = p.top + Math.max(p.rise, p.fall) + 3;
    columns = p.left + p.rise + p.fall + 3;
    start = { row: p.top + p.rise, column: p.left };
    for (let step = 0; step < p.rise; step++) {
      const row = start.row - step,
        column = p.left + step;
      target(row, column);
      wall(row, column, 0, 1);
      wall(row - 1, column + 1, 1, 0);
    }
    target(p.top, p.left + p.rise);
    for (let step = 1; step <= p.fall; step++) {
      const row = p.top + step,
        column = p.left + p.rise + step;
      target(row, column);
      wall(row, column - 1, 0, 1);
      wall(row - 1, column - 1, 1, 0);
    }
  } else {
    integer(p.width, 3, 18);
    integer(p.height, 3, 18);
    integer(p.holeX, 1, p.width - 2);
    integer(p.holeWidth, 1, p.width - p.holeX - 1);
    integer(p.holeY, 1, p.height - 2);
    integer(p.holeHeight, 1, p.height - p.holeY - 1);
    rows = p.top + p.height + 2;
    columns = p.left + p.width + 2;
    const column =
      p.kind === 'robot-corner-right' ? p.left : p.left + p.width - 1;
    start = {
      row: p.kind === 'robot-corner-right' ? p.top : p.top + p.height - 1,
      column: p.left + p.width - 1,
    };
    for (let x = 0; x < p.width; x++)
      if (x < p.holeX || x >= p.holeX + p.holeWidth) {
        wall(p.top - 1, p.left + x, 1, 0);
        target(p.top, p.left + x);
      }
    for (let y = 0; y < p.height; y++)
      if (y < p.holeY || y >= p.holeY + p.holeHeight) {
        wall(
          p.top + y,
          p.kind === 'robot-corner-right' ? column - 1 : column,
          0,
          1,
        );
        target(p.top + y, column);
      }
  }
  return {
    kind: 'robot-field',
    description:
      'Авторское поле экзаменационного семейства: круги — цели, крест — старт; размер на рисунке — только пример.',
    rows,
    columns,
    start,
    painted: [],
    targets: [...targets.values()].sort(
      (a, b) => a.row - b.row || a.column - b.column,
    ),
    walls: [...walls.values()],
  };
}

export function randomExamCase(kind: ExamRobotKind, rng: Rng): ExamRobotCase {
  const top = rng.int(1, 3),
    left = rng.int(1, 3);
  if (kind === 'robot-stairs')
    return { kind, top, left, rise: rng.int(1, 10), fall: rng.int(1, 10) };
  const width = rng.int(3, 18),
    height = rng.int(3, 18),
    holeX = rng.int(1, width - 2),
    holeY = rng.int(1, height - 2);
  return {
    kind,
    top,
    left,
    width,
    height,
    holeX,
    holeY,
    holeWidth: rng.int(1, width - holeX - 1),
    holeHeight: rng.int(1, height - holeY - 1),
  };
}

export function examEdges(kind: ExamRobotKind): ExamRobotCase[] {
  if (kind === 'robot-stairs')
    return [
      { kind, rise: 1, fall: 1, top: 1, left: 1 },
      { kind, rise: 10, fall: 1, top: 3, left: 3 },
      { kind, rise: 1, fall: 10, top: 2, left: 2 },
      { kind, rise: 10, fall: 10, top: 1, left: 1 },
    ];
  return [
    {
      kind,
      width: 3,
      height: 3,
      holeX: 1,
      holeY: 1,
      holeWidth: 1,
      holeHeight: 1,
      top: 1,
      left: 1,
    },
    {
      kind,
      width: 18,
      height: 18,
      holeX: 1,
      holeY: 1,
      holeWidth: 16,
      holeHeight: 16,
      top: 3,
      left: 3,
    },
    {
      kind,
      width: 18,
      height: 18,
      holeX: 16,
      holeY: 16,
      holeWidth: 1,
      holeHeight: 1,
      top: 2,
      left: 2,
    },
    {
      kind,
      width: 18,
      height: 3,
      holeX: 1,
      holeY: 1,
      holeWidth: 1,
      holeHeight: 1,
      top: 1,
      left: 3,
    },
  ];
}
