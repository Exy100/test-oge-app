/** Author-created bounded models of the universally quantified official families.
 * These are not transcriptions of the pictures in the PDFs.
 */
import type { RobotField } from '../../../src/core/robot';
import type { Year } from './short-answers';

export function examRobotField(year: Year, size: number): RobotField {
  const walls: RobotField['walls'] = [];
  const horizontalEdges = new Set<string>();
  const targets: RobotField['targets'] = [];
  const vertical = (row: number, column: number) => {
    walls.push({ from: { row, column }, to: { row, column: column + 1 } });
  };
  const horizontal = (row: number, column: number) => {
    const key = `${String(row)},${String(column)}`;
    if (horizontalEdges.has(key)) return;
    horizontalEdges.add(key);
    walls.push({ from: { row, column }, to: { row: row + 1, column } });
  };
  const target = (row: number, column: number) => {
    if (!targets.some((cell) => cell.row === row && cell.column === column))
      targets.push({ row, column });
  };
  let start: RobotField['start'];
  if (year === 2025) {
    for (let column = 1; column <= 8 + size; column++)
      if (column !== 6 && column !== 7) {
        horizontal(1, column);
        target(2, column);
      }
    for (let row = 2; row <= 8 + size; row++)
      if (row !== 4 && row !== 5) {
        vertical(row, 0);
        target(row, 1);
      }
    start = { row: 2, column: 8 + size };
  } else if (year === 2026) {
    const column = 8 + size;
    for (let row = 2; row <= 9 + size; row++)
      if (row !== 5 && row !== 6) {
        vertical(row, column);
        target(row, column);
      }
    for (let x = 3; x <= column; x++)
      if (x !== 5) {
        horizontal(1, x);
        target(2, x);
      }
    start = { row: 9 + size, column };
  } else {
    const rise = 2 + size,
      fall = 1 + size;
    let row = rise + 2,
      column = 2;
    start = { row, column };
    for (let i = 0; i < rise; i++) {
      vertical(row, column);
      horizontal(row - 1, column + 1);
      target(row, column);
      row--;
      column++;
    }
    target(row, column);
    row++;
    column++;
    for (let i = 0; i < fall; i++) {
      vertical(row, column - 1);
      horizontal(row - 1, column - 1);
      target(row, column);
      row++;
      column++;
    }
  }
  return {
    kind: 'robot-field',
    description: 'Учебная модель семейства из официального условия.',
    rows: 25,
    columns: 25,
    start,
    painted: [],
    targets,
    walls,
  };
}
