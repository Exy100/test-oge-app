import type { ExamRobotCase } from '../../../src/core/generators/15/exam-fields';

/** Classify grid coordinates/adjacent pairs, rather than reconstructing walls by walking. */
export function examTarget(
  p: ExamRobotCase,
  row: number,
  column: number,
): boolean {
  if (p.kind === 'robot-stairs') {
    const peak = p.left + p.rise;
    return (
      column >= p.left &&
      column <= peak + p.fall &&
      row === p.top + Math.abs(column - peak)
    );
  }
  const verticalColumn =
    p.kind === 'robot-corner-right' ? p.left : p.left + p.width - 1;
  return (
    (row === p.top &&
      column >= p.left &&
      column < p.left + p.width &&
      !(
        column >= p.left + p.holeX && column < p.left + p.holeX + p.holeWidth
      )) ||
    (column === verticalColumn &&
      row >= p.top &&
      row < p.top + p.height &&
      !(row >= p.top + p.holeY && row < p.top + p.holeY + p.holeHeight))
  );
}

export function examBarrier(
  p: ExamRobotCase,
  row: number,
  column: number,
  nextRow: number,
): boolean {
  const horizontal = row !== nextRow;
  if (p.kind === 'robot-stairs') {
    const peak = p.left + p.rise;
    return horizontal
      ? column > p.left &&
          column < peak + p.fall &&
          row === p.top + Math.abs(column - peak)
      : (column >= p.left && column < peak && row === p.top + peak - column) ||
          (column >= peak &&
            column < peak + p.fall &&
            row === p.top + column - peak + 1);
  }
  return horizontal
    ? row === p.top - 1 &&
        column >= p.left &&
        column < p.left + p.width &&
        !(column >= p.left + p.holeX && column < p.left + p.holeX + p.holeWidth)
    : column ===
        (p.kind === 'robot-corner-right' ? p.left - 1 : p.left + p.width - 1) &&
        row >= p.top &&
        row < p.top + p.height &&
        !(row >= p.top + p.holeY && row < p.top + p.holeY + p.holeHeight);
}
