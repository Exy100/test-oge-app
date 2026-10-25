import { runRobot, type RobotField } from '../../core/robot/index.ts';
import {
  mazeLevels,
  type MazeLevel,
  type Parcel,
  type SortingLevel,
} from './factory-levels.ts';
export { mazeLevels, sortingLevels } from './factory-levels.ts';
export type { Parcel } from './factory-levels.ts';
export function mazeField(level: number, example: number) {
  const field = mazeLevels[level]?.fields[example];
  if (!field) throw new RangeError('Неизвестное поле лабиринта.');
  return field;
}
export function checkMaze(level: MazeLevel, source: string) {
  try {
    const results = level.fields.map((field) =>
      runRobot(source, field, { maxSteps: 1000, traceLimit: 0 }),
    );
    const failed = results.findIndex((result) => !result.success);
    return {
      correct: failed < 0,
      message:
        failed < 0
          ? 'Верно: программа закрашивает ровно нужные клетки на всех трёх полях.'
          : `Поле ${String(failed + 1)}: ${results[failed]?.message ?? ''}`,
      results,
    };
  } catch (cause) {
    return {
      correct: false,
      message:
        cause instanceof Error ? cause.message : 'Проверь программу Робота.',
      results: [],
    };
  }
}
export function mazeSensors(field: RobotField, position: RobotField['start']) {
  return (['вверх', 'вниз', 'влево', 'вправо'] as const).map((command) => ({
    command,
    free:
      runRobot(
        command,
        { ...field, start: position },
        { maxSteps: 1, traceLimit: 0 },
      ).status !== 'crashed',
  }));
}

export function acceptsParcel(level: SortingLevel, parcel: Parcel) {
  if (level.rule === 'heavy') return parcel.weight >= 5;
  if (level.rule === 'and') return parcel.zone === 'А' && parcel.weight >= 4;
  return parcel.zone === 'А' || parcel.weight <= 4;
}
export function checkSorting(
  level: SortingLevel,
  routes: readonly (boolean | null)[],
  count: string,
  sum: string,
) {
  if (
    routes.length !== level.parcels.length ||
    routes.some((route) => route === null)
  )
    return {
      correct: false,
      message: 'Распредели все восемь посылок между отбором и остальными.',
    };
  const wrong = level.parcels.findIndex(
    (parcel, i) => routes[i] !== acceptsParcel(level, parcel),
  );
  if (wrong >= 0) {
    const parcel = level.parcels[wrong];
    return {
      correct: false,
      message: `Проверь посылку №${String(parcel?.id)}: зона ${parcel?.zone ?? ''}, масса ${String(parcel?.weight)} кг. ${level.goal}`,
    };
  }
  const selected = level.parcels.filter((parcel) =>
    acceptsParcel(level, parcel),
  );
  const total = selected.reduce((value, parcel) => value + parcel.weight, 0);
  if (
    !/^\d+$/u.test(count.trim()) ||
    !/^\d+$/u.test(sum.trim()) ||
    Number(count) !== selected.length ||
    Number(sum) !== total
  )
    return {
      correct: false,
      message:
        'Распределение верное. Пересчитай отобранные посылки и сложи их массы. При условии ИЛИ посылку, подходящую по обоим признакам, учитывай один раз.',
    };
  return {
    correct: true,
    message: `Верно: отобрано ${String(selected.length)}, масса ${selected.map((parcel) => String(parcel.weight)).join(' + ')} = ${String(total)} кг.`,
  };
}
