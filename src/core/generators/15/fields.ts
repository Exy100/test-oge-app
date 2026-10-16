import { Rng } from '../../rng.ts';
import type { RobotField } from '../../robot/index.ts';
import {
  examRobotKinds,
  examField,
  examEdges,
  randomExamCase,
  type ExamRobotCase,
} from './exam-fields.ts';
export const robotKinds = [
  'robot-corridor',
  'robot-wall-gaps',
  'robot-comb',
  'robot-room',
  ...examRobotKinds,
] as const;
export type RobotKind = (typeof robotKinds)[number];
export const isRobotKind = (value: string): value is RobotKind =>
  robotKinds.some((kind) => kind === value);
export type RobotCase =
  | ExamRobotCase
  | {
      kind: 'robot-corridor';
      length: number;
      left: number;
      top: number;
      rightPad: number;
      bottomPad: number;
    }
  | {
      kind: 'robot-wall-gaps';
      height: number;
      column: number;
      rightPad: number;
      mask: number;
    }
  | { kind: 'robot-comb'; heights: readonly number[] }
  | {
      kind: 'robot-room';
      height: number;
      width: number;
      top: number;
      left: number;
      bottomPad: number;
      rightPad: number;
    };
type Cell = RobotField['start'];
const key = (cell: Cell) => `${String(cell.row)},${String(cell.column)}`;
function integer(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error('Недопустимые параметры семейства Робота.');
}
export function fieldFor(p: RobotCase): RobotField {
  if (
    p.kind === 'robot-corner-right' ||
    p.kind === 'robot-corner-left' ||
    p.kind === 'robot-stairs'
  )
    return examField(p);
  let rows: number,
    columns: number,
    start: Cell,
    targets: Cell[] = [];
  const wallMap = new Map<string, RobotField['walls'][number]>();
  const wall = (from: Cell, to: Cell) => {
    wallMap.set([key(from), key(to)].sort().join(':'), { from, to });
  };
  const padding = (...values: number[]) => {
    for (const value of values) integer(value, 0, 2);
  };
  const cells = new Set<string>();
  if (p.kind === 'robot-wall-gaps') {
    integer(p.height, 1, 12);
    integer(p.column, 1, 3);
    padding(p.rightPad);
    integer(p.mask, 0, 2 ** p.height - 1);
    rows = p.height;
    columns = p.column + 1 + p.rightPad;
    start = { row: rows - 1, column: p.column };
    for (let row = 0; row < rows; row++)
      if ((p.mask & (2 ** row)) !== 0) {
        wall({ row, column: p.column - 1 }, { row, column: p.column });
        targets.push({ row, column: p.column });
      }
  } else {
    if (p.kind === 'robot-corridor') {
      integer(p.length, 1, 12);
      padding(p.left, p.top, p.rightPad, p.bottomPad);
      rows = p.top + 1 + p.bottomPad;
      columns = p.left + p.length + p.rightPad;
      start = { row: p.top, column: p.left };
      for (let column = p.left; column < p.left + p.length; column++)
        targets.push({ row: p.top, column });
      for (const cell of targets) cells.add(key(cell));
    } else if (p.kind === 'robot-room') {
      integer(p.height, 1, 12);
      integer(p.width, 1, 12);
      padding(p.top, p.left, p.bottomPad, p.rightPad);
      rows = p.top + p.height + p.bottomPad;
      columns = p.left + p.width + p.rightPad;
      start = { row: p.top, column: p.left };
      for (let row = p.top; row < p.top + p.height; row++)
        for (let column = p.left; column < p.left + p.width; column++)
          targets.push({ row, column });
      for (const cell of targets) cells.add(key(cell));
    } else {
      integer(p.heights.length, 1, 10);
      for (const height of p.heights) integer(height, 0, 6);
      rows = Math.max(1, ...p.heights) + 1;
      columns = p.heights.length;
      start = { row: rows - 1, column: 0 };
      for (const [column, height] of p.heights.entries()) {
        cells.add(key({ row: rows - 1, column }));
        for (let d = 1; d <= height; d++) {
          const cell = { row: rows - 1 - d, column };
          cells.add(key(cell));
          targets.push(cell);
        }
      }
      for (let row = 0; row < rows - 1; row++)
        for (let column = 0; column < columns - 1; column++)
          wall({ row, column }, { row, column: column + 1 });
    }
    // The reachable shape is enclosed; outer grid boundaries need no explicit edge.
    for (const value of cells) {
      const [row = 0, column = 0] = value.split(',').map(Number);
      for (const [dr = 0, dc = 0] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const next = { row: row + dr, column: column + dc };
        if (
          next.row >= 0 &&
          next.row < rows &&
          next.column >= 0 &&
          next.column < columns &&
          !cells.has(key(next))
        )
          wall({ row, column }, next);
      }
    }
  }
  targets = targets.sort((a, b) => a.row - b.row || a.column - b.column);
  return {
    kind: 'robot-field',
    description:
      'Учебное поле Робота: круги — цели закраски, знак Робота — старт; остальные клетки закрашивать нельзя.',
    rows,
    columns,
    start,
    painted: [],
    targets,
    walls: [...wallMap.values()],
  };
}
function randomCase(kind: RobotKind, rng: Rng): RobotCase {
  if (
    kind === 'robot-corner-right' ||
    kind === 'robot-corner-left' ||
    kind === 'robot-stairs'
  )
    return randomExamCase(kind, rng);
  const pad = () => rng.int(0, 2);
  if (kind === 'robot-corridor')
    return {
      kind,
      length: rng.int(1, 12),
      left: pad(),
      top: pad(),
      rightPad: pad(),
      bottomPad: pad(),
    };
  if (kind === 'robot-wall-gaps') {
    const height = rng.int(1, 12);
    return {
      kind,
      height,
      column: rng.int(1, 3),
      rightPad: pad(),
      mask: rng.int(1, 2 ** height - 1),
    };
  }
  if (kind === 'robot-comb')
    return {
      kind,
      heights: Array.from({ length: rng.int(1, 10) }, () => rng.int(0, 6)),
    };
  return {
    kind,
    height: rng.int(1, 12),
    width: rng.int(1, 12),
    top: pad(),
    left: pad(),
    bottomPad: pad(),
    rightPad: pad(),
  };
}
export function robotCases(
  kind: RobotKind,
  seed: string,
): readonly RobotCase[] {
  const rng = new Rng(`${kind}:${seed}`);
  let edges: RobotCase[];
  if (kind === 'robot-corridor')
    edges = [
      { kind, length: 1, left: 0, top: 0, rightPad: 0, bottomPad: 0 },
      { kind, length: 12, left: 2, top: 2, rightPad: 2, bottomPad: 2 },
    ];
  else if (kind === 'robot-wall-gaps')
    edges = [
      { kind, height: 1, column: 1, rightPad: 0, mask: 0 },
      { kind, height: 12, column: 3, rightPad: 2, mask: 4095 },
      { kind, height: 12, column: 1, rightPad: 1, mask: 1365 },
    ];
  else if (kind === 'robot-comb')
    edges = [
      { kind, heights: [0] },
      { kind, heights: [6] },
      { kind, heights: [0, 6, 0, 1, 6, 0, 4, 2, 0, 6] },
    ];
  else if (kind === 'robot-room')
    edges = [
      { kind, height: 1, width: 1, top: 0, left: 0, bottomPad: 0, rightPad: 0 },
      {
        kind,
        height: 12,
        width: 12,
        top: 2,
        left: 2,
        bottomPad: 2,
        rightPad: 2,
      },
      {
        kind,
        height: 11,
        width: 1,
        top: 1,
        left: 1,
        bottomPad: 1,
        rightPad: 1,
      },
    ];
  else edges = examEdges(kind);
  const cases = [randomCase(kind, rng), ...edges];
  while (cases.length < 8) cases.push(randomCase(kind, rng));
  return cases;
}
export function robotExample(kind: RobotKind, seed: string): RobotField {
  const first = robotCases(kind, seed)[0];
  if (!first) throw new Error('Нет поля Робота.');
  return fieldFor(first);
}
