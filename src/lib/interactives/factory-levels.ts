import { fieldFor, type RobotKind } from '../../core/generators/15/fields.ts';
import type { RobotField } from '../../core/robot/index.ts';
export interface MazeLevel {
  id: string;
  title: string;
  family: RobotKind;
  goal: string;
  fields: readonly RobotField[];
}
export const mazeLevels: readonly MazeLevel[] = [
  {
    id: 'corridor',
    title: 'Коридор: цикл и крайняя клетка',
    family: 'robot-corridor',
    goal: 'Закрась весь коридор, включая первую и последнюю клетки. Длину узнавай датчиком справа.',
    fields: [4, 1, 6].map((length) =>
      fieldFor({
        kind: 'robot-corridor',
        length,
        left: 0,
        top: 0,
        rightPad: 0,
        bottomPad: 0,
      }),
    ),
  },
  {
    id: 'gaps',
    title: 'Стена с проходами: датчик и условие',
    family: 'robot-wall-gaps',
    goal: 'Иди вверх по правому столбцу. Закрась только клетки, слева от которых есть стена; проходы не закрашивай.',
    fields: [11, 5, 0].map((mask) =>
      fieldFor({
        kind: 'robot-wall-gaps',
        height: 4,
        column: 1,
        rightPad: 0,
        mask,
      }),
    ),
  },
  {
    id: 'stairs',
    title: 'Лестница: подъём и спуск',
    family: 'robot-stairs',
    goal: 'Закрась отмеченные клетки вдоль подъёма и спуска лестницы. Число ступеней заранее неизвестно; следи за стенами справа и слева.',
    fields: [
      [2, 2],
      [1, 3],
      [3, 1],
    ].map(([rise, fall]) =>
      fieldFor({
        kind: 'robot-stairs',
        rise: rise ?? 1,
        fall: fall ?? 1,
        top: 1,
        left: 1,
      }),
    ),
  },
];
export interface Parcel {
  id: number;
  zone: 'А' | 'Б';
  weight: number;
}
export interface SortingLevel {
  id: string;
  title: string;
  rule: 'heavy' | 'and' | 'or';
  goal: string;
  parcels: readonly Parcel[];
}
const parcels: readonly Parcel[] = [
  { id: 1, zone: 'А', weight: 5 },
  { id: 2, zone: 'Б', weight: 4 },
  { id: 3, zone: 'А', weight: 0 },
  { id: 4, zone: 'Б', weight: 6 },
  { id: 5, zone: 'А', weight: 4 },
  { id: 6, zone: 'Б', weight: 1 },
  { id: 7, zone: 'А', weight: 9 },
  { id: 8, zone: 'Б', weight: 5 },
];
export const sortingLevels: readonly SortingLevel[] = [
  {
    id: 'weight',
    title: 'Граница отбора',
    rule: 'heavy',
    goal: 'Отбери посылки массой не меньше 5 кг. Найди их количество и суммарную массу.',
    parcels,
  },
  {
    id: 'intersection',
    title: 'Два условия одновременно',
    rule: 'and',
    goal: 'Отбери посылки в зону А массой не меньше 4 кг. Оба условия должны выполняться. Найди количество и суммарную массу.',
    parcels,
  },
  {
    id: 'union',
    title: 'Хотя бы одно условие',
    rule: 'or',
    goal: 'Отбери посылки в зону А или массой не больше 4 кг. Достаточно хотя бы одного условия; каждую посылку учитывай один раз. Найди количество и суммарную массу.',
    parcels,
  },
];
