import { createDataset, type Dataset, type SourceFile } from '../../datasets';
import { Drawing } from '../../banks/illustrations';
import type { TaskInstance } from '../../types';
import { fieldFor, isRobotKind, robotCases, robotExample } from './fields';
import { robotGenerators, assessRobot, referenceProgram } from './robots';
import type { RobotField } from '../../robot';
export function fieldImage(field: RobotField): Uint8Array {
  const drawing = new Drawing(480, 480),
    size = Math.floor(432 / Math.max(field.rows, field.columns)),
    left = 24,
    top = 24;
  const ink = [22, 59, 52] as const,
    green = [80, 139, 83] as const,
    orange = [235, 159, 101] as const,
    line = [165, 183, 176] as const;
  for (let row = 0; row <= field.rows; row++)
    drawing.line(
      left,
      top + row * size,
      left + field.columns * size,
      top + row * size,
      line,
      1,
    );
  for (let column = 0; column <= field.columns; column++)
    drawing.line(
      left + column * size,
      top,
      left + column * size,
      top + field.rows * size,
      line,
      1,
    );
  for (const cell of field.targets)
    drawing.circle(
      left + (cell.column + 0.5) * size,
      top + (cell.row + 0.5) * size,
      Math.max(3, size / 6),
      green,
    );
  for (const wall of field.walls) {
    const horizontal = wall.from.row !== wall.to.row;
    const x =
      left +
      (horizontal
        ? wall.from.column
        : Math.max(wall.from.column, wall.to.column)) *
        size;
    const y =
      top +
      (horizontal ? Math.max(wall.from.row, wall.to.row) : wall.from.row) *
        size;
    drawing.line(
      x,
      y,
      x + (horizontal ? size : 0),
      y + (horizontal ? 0 : size),
      ink,
      2,
    );
  }
  drawing.line(left, top, left + field.columns * size, top, ink, 2);
  drawing.line(left, top, left, top + field.rows * size, ink, 2);
  drawing.line(
    left + field.columns * size,
    top,
    left + field.columns * size,
    top + field.rows * size,
    ink,
    2,
  );
  drawing.line(
    left,
    top + field.rows * size,
    left + field.columns * size,
    top + field.rows * size,
    ink,
    2,
  );
  const x = left + (field.start.column + 0.5) * size,
    y = top + (field.start.row + 0.5) * size;
  drawing.line(x - size / 5, y, x + size / 5, y, orange, 2);
  drawing.line(x, y - size / 5, x, y + size / 5, orange, 2);
  return drawing.png();
}
export async function createRobotDataset(task: TaskInstance): Promise<Dataset> {
  const generator = robotGenerators.find(
    (item) => item.id === task.generatorId,
  );
  if (!generator || !isRobotKind(task.subtype) || !generator.verify(task))
    throw new Error('Неизвестный набор Робота.');
  const kind = task.subtype,
    seed = task.seed,
    example = robotExample(kind, seed),
    parameters = robotCases(kind, seed),
    program = referenceProgram(kind),
    sources: SourceFile[] = [];
  const put = (
    path: string,
    format: SourceFile['format'],
    value: string | Uint8Array,
  ) =>
    sources.push({
      path,
      format,
      license: 'CC0-1.0',
      bytes:
        typeof value === 'string'
          ? new TextEncoder().encode(value + '\n')
          : value,
    });
  const json = (path: string, value: unknown) =>
    put(path, 'json', JSON.stringify(value, null, 2));
  put(
    'README.txt',
    'txt',
    'Авторский учебный набор №15. CC0-1.0. Открой assignment.txt и source/example.png. Зелёные круги — клетки, которые нужно закрасить; оранжевый крест — Робот, тёмные линии — стены. Крест и круг могут находиться в одной клетке. Исходной закраски нет.\nПрограмма должна решать всё описанное семейство, а не один рисунок. source/family.json содержит параметры восьми проверочных полей; validation/fields.json — их полные схемы. JSON — собственный учебный формат, не файл обстановки «Кумира»: перенеси пример в редактор поля вручную по рисунку и координатам (индексы с 0).\nСохрани программу answer.txt в UTF-8. Язык: использовать Робот / алг / нач / кон; вверх, вниз, влево, вправо, закрасить; датчики сверху/снизу/слева/справа свободно или стена; если ... то / иначе / все; нц пока ... / кц. Одна команда или граница блока на строку. Это ограниченный учебный язык, не полный «Кумир».\nПосле самостоятельного решения сравни с reference/answer.txt. Локальная проверка использует не больше 5000 инструкций на поле, без сохранения полной трассы. Конечная позиция не ограничена. Конечный набор тестов помогает найти ошибки и не является доказательством для всех возможных полей. Учебные критерии 0/1/2 не заменяют официальную экспертную оценку. Персональные данные не нужны.',
  );
  put('assignment.txt', 'txt', task.statement);
  json('source/example.json', example);
  put('source/example.png', 'png', fieldImage(example));
  json('source/family.json', { kind, seed, parameters });
  json('validation/fields.json', parameters.map(fieldFor));
  put('reference/answer.txt', 'txt', program.trimEnd());
  json('reference/results.json', assessRobot(kind, seed, program));
  json('criteria.json', {
    kind: 'educational-self-assessment',
    ...task.criteria,
  });
  return createDataset(task.datasetId ?? '', seed, task.generatorId, sources);
}
