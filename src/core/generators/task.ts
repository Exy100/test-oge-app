import type { TaskInstance } from '../types.ts';

type Content = Pick<
  TaskInstance,
  'statement' | 'answer' | 'solution' | 'hints' | 'commonMistakes'
>;

/** Integer quantities used in the Russian task statements. */
export function quantity(
  value: number,
  forms: readonly [string, string, string],
): string {
  const lastTwo = value % 100;
  const last = value % 10;
  const form =
    lastTwo >= 11 && lastTwo <= 14
      ? forms[2]
      : last === 1
        ? forms[0]
        : last >= 2 && last <= 4
          ? forms[1]
          : forms[2];
  return `${String(value)} ${form}`;
}

export const bytes = (value: number): string =>
  quantity(value, ['байт', 'байта', 'байт']);

export function taskFrom(
  subtype: string,
  taskNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
  seed: string,
  content: Content,
): TaskInstance {
  const generatorId = `${subtype}-v1`;
  return {
    id: `${generatorId}:${seed}`,
    generatorId,
    seed,
    taskNumber,
    examPart: 1,
    subtype,
    difficulty: 2,
    topics: [
      {
        1: 'Объём информации',
        2: 'Кодирование',
        3: 'Логические выражения',
        4: 'Модели и маршруты',
        5: 'Команды исполнителя',
        6: 'Выполнение программ',
        7: 'Адресация в Интернете',
        8: 'Поисковые запросы',
        9: 'Схемы и направленные пути',
        10: 'Системы счисления',
      }[taskNumber],
    ],
    ...content,
  };
}

export const bits = (value: number): string =>
  quantity(value, ['бит', 'бита', 'бит']);
