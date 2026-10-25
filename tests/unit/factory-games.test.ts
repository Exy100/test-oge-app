import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mazeLevels,
  sortingLevels,
} from '../../src/lib/interactives/factory-levels';
import {
  checkMaze,
  checkSorting,
  acceptsParcel,
  mazeSensors,
} from '../../src/lib/interactives/factory-games';
import { referenceProgram } from '../../src/core/generators/15/robots';
import { RobotExecution } from '../../src/core/robot';

for (const level of mazeLevels) {
  it(`${level.id}: general algorithms and independent Python agree on all fields`, () => {
    const code = referenceProgram(level.family),
      checked = checkMaze(level, code);
    expect(checked.correct).toBe(true);
    expect(checked.results).toHaveLength(3);
    const input = level.fields.map((field) => ({ source: code, field }));
    const independent: unknown = JSON.parse(
      execFileSync('python3', ['scripts/check-robots.py', '--json'], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 10000,
      }),
    );
    expect(independent).toHaveLength(3);
    expect(independent).toEqual(
      checked.results.map((result) => ({
        position: result.position,
        painted: result.painted,
      })),
    );
  });
  it(`${level.id}: rejects empty code, missing paint and an infinite loop`, () => {
    for (const code of [
      '',
      'вверх',
      'нц пока клетка не закрашена\nкц',
      referenceProgram(level.family).replaceAll('закрасить', ''),
    ])
      expect(checkMaze(level, code).correct).toBe(false);
  });
  it(`${level.id}: step and full execution have identical state, including boundaries`, () => {
    for (const field of level.fields) {
      const code = referenceProgram(level.family),
        machine = new RobotExecution(code, field, { maxSteps: 1000 }),
        whole = new RobotExecution(code, field, { maxSteps: 1000 }).run();
      while (['ready', 'running'].includes(machine.snapshot().status))
        machine.step();
      expect(machine.snapshot()).toEqual(whole);
      const sensors = mazeSensors(field, field.start);
      for (const sensor of sensors) {
        const [dr, dc] =
          sensor.command === 'вверх'
            ? [-1, 0]
            : sensor.command === 'вниз'
              ? [1, 0]
              : sensor.command === 'влево'
                ? [0, -1]
                : [0, 1];
        const next = {
          row: field.start.row + dr,
          column: field.start.column + dc,
        };
        const key = (cell: typeof next) =>
          `${String(cell.row)}:${String(cell.column)}`;
        const blocked = field.walls.some(
          (w) =>
            new Set([key(w.from), key(w.to)]).has(key(field.start)) &&
            new Set([key(w.from), key(w.to)]).has(key(next)),
        );
        expect(sensor.free).toBe(
          next.row >= 0 &&
            next.column >= 0 &&
            next.row < field.rows &&
            next.column < field.columns &&
            !blocked,
        );
      }
    }
  });
}
for (const level of sortingLevels) {
  it(`${level.id}: all 256 assignments are checked independently, including boundary values`, () => {
    const expected = level.parcels.map((p) =>
      level.rule === 'heavy'
        ? !(p.weight < 5)
        : level.rule === 'and'
          ? ![p.zone !== 'А', p.weight < 4].some(Boolean)
          : ![p.zone !== 'А', p.weight > 4].every(Boolean),
    );
    const count = expected.filter(Boolean).length,
      total = level.parcels.reduce(
        (s, p, i) => s + (expected[i] ? p.weight : 0),
        0,
      );
    expect(level.parcels.map((p) => acceptsParcel(level, p))).toEqual(expected);
    for (let mask = 0; mask < 256; mask++) {
      const routes = level.parcels.map((_, i) => Boolean(mask & (1 << i)));
      expect(
        checkSorting(level, routes, String(count), String(total)).correct,
      ).toBe(routes.every((r, i) => r === expected[i]));
    }
    expect(
      checkSorting(level, expected, String(count + 1), String(total)).correct,
    ).toBe(false);
    expect(
      checkSorting(level, expected, String(count), String(total + 1)).correct,
    ).toBe(false);
    expect(checkSorting(level, expected, '', '').correct).toBe(false);
    expect(
      checkSorting(
        level,
        Array.from({ length: 8 }, () => null),
        '0',
        '0',
      ).correct,
    ).toBe(false);
  });
}
