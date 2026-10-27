import type { StreamReference } from '../../core/stream/schemas';
import type { ChoiceQuestion } from './quiz';
import { robotExample, type RobotKind } from '../../core/generators/15/fields';
import {
  programParameters,
  programCases,
  type ProgramKind,
} from '../../core/generators/16/problems';
import { sitePath } from '../site';
export type CodingTopic =
  | 'commands'
  | 'loops'
  | 'general'
  | 'input'
  | 'conditions'
  | 'aggregates'
  | 'testing';
const kinds = {
  commands: ['robot-corridor', 'robot-wall-gaps', 'robot-corner-right'],
  loops: ['robot-wall-gaps', 'robot-room', 'robot-comb'],
  general: ['robot-corner-right', 'robot-corner-left', 'robot-stairs'],
  input: ['python-positive-mean', 'python-base7-sum', 'python-octal-sentinel'],
  conditions: [
    'python-base7-sum',
    'python-octal-sentinel',
    'python-positive-mean',
  ],
  aggregates: [
    'python-positive-mean',
    'python-base7-sum',
    'python-octal-sentinel',
  ],
  testing: [
    'python-octal-sentinel',
    'python-positive-mean',
    'python-base7-sum',
  ],
} as const;
export const codingSources: StreamReference[] = [
  ...new Set(Object.values(kinds).flat()),
].map((kind) => ({
  generatorId: kind + (kind.startsWith('robot-') ? '-v2' : '-v1'),
  taskNumber: kind.startsWith('robot-') ? 15 : 16,
  seed: 'lesson-' + kind,
}));
export function codingExample(
  topic: CodingTopic,
  index: number,
): StreamReference {
  const kind = kinds[topic][index];
  const source = codingSources.find(
    (item) => item.seed === 'lesson-' + String(kind),
  );
  if (!source || !Number.isInteger(index))
    throw new RangeError('Нет учебного примера.');
  return source;
}
export const codingArchiveKey = (source: StreamReference) =>
  source.generatorId + '.' + source.seed;
export function codingArchiveHref(source: StreamReference) {
  return codingSources.some(
    (item) =>
      codingArchiveKey(item) === codingArchiveKey(source) &&
      item.taskNumber === source.taskNumber,
  )
    ? sitePath('/materials/files/coding/' + codingArchiveKey(source) + '.zip')
    : undefined;
}
const concepts: Record<
  CodingTopic,
  readonly (readonly [string, string, string, string])[]
> = {
  commands: [
    [
      'Что делает датчик «справа свободно»?',
      'Возвращает ответ, не перемещая Робота',
      'Перемещает Робота вправо',
      'Проверка датчика и движение — разные действия.',
    ],
    [
      'Как безопасно сделать один шаг вправо?',
      'Сначала проверить справа свободно',
      'Сначала шагнуть, потом проверить',
      'Столкновение нельзя исправить проверкой после движения.',
    ],
    [
      'Что означает закрасить?',
      'Закрасить текущую клетку',
      'Закрасить все клетки впереди',
      'Команда не перемещает исполнителя.',
    ],
  ],
  loops: [
    [
      'Что произойдёт при ложном условии нц пока перед первым входом?',
      'Тело не выполнится',
      'Тело выполнится один раз',
      'Условие проверяется перед каждым проходом.',
    ],
    [
      'Почему цикл «пока справа свободно: закрасить» может не завершиться?',
      'Состояние датчика не меняется',
      'Любая закраска обязательно выключает датчик',
      'Закраска не меняет стен и положения.',
    ],
    [
      'Как не пропустить последнюю клетку коридора?',
      'Закрасить старт, затем после каждого шага',
      'Красить только перед шагом внутри цикла',
      'Последний шаг приходит к стене; новая проверка уже ложна.',
    ],
  ],
  general: [
    [
      'Что требуется от обобщённого алгоритма?',
      'Работать на всех полях, описанных условием',
      'Повторить размеры одного рисунка',
      'Параметры неизвестны; нужен аргумент о работе для любого допустимого размера.',
    ],
    [
      'Как проход в стене влияет на закраску возле неё?',
      'Датчик отличает стену от прохода',
      'Можно закрасить весь ряд без проверок',
      'Требуемая закраска определяется условием, а не только посещением клеток.',
    ],
    [
      'Доказывают ли восемь успешных полей правильность для любого размера?',
      'Нет, ещё нужен разбор алгоритма',
      'Да, других размеров не бывает',
      'Конечные тесты обнаруживают ошибки, но не заменяют обоснование.',
    ],
  ],
  input: [
    [
      'Что делает int(input())?',
      'Читает строку и преобразует её в целое',
      'Выводит строку на экран',
      'input читает строку; int выполняет преобразование.',
    ],
    [
      'Нужно ли включать N в обрабатываемую последовательность?',
      'Нет, N сообщает число следующих значений',
      'Да, N — первое значение данных',
      'Заголовок входа и сами данные имеют разные роли.',
    ],
    [
      'Можно ли печатать «Введите число» в ответе программы?',
      'Нет, только требуемые результаты',
      'Да, приглашения всегда игнорируются',
      'Автоматическая проверка сравнивает выходные данные.',
    ],
  ],
  conditions: [
    [
      'Как проверить, что последняя семеричная цифра равна 1?',
      'x % 7 == 1',
      'x % 7 == 0',
      'Остаток определяет последнюю цифру записи в основании 7.',
    ],
    [
      'Как соединить два одновременно обязательных условия в Python?',
      'and',
      'or',
      'and требует истинности обоих условий.',
    ],
    [
      'Как проверить четырёхзначность в основании 8?',
      '8 ** 3 <= x < 8 ** 4',
      '1000 <= x < 10000',
      'Границы зависят от основания, а не от десятичного вида записи.',
    ],
  ],
  aggregates: [
    [
      'Чем отличается счётчик от суммы?',
      'Счётчик добавляет 1, сумма — значение',
      'Оба всегда добавляют 1',
      'Различай количество подходящих и сумму их значений.',
    ],
    [
      'Как найти среднее отобранных положительных?',
      'Их сумма / их количество',
      'Их сумма / N',
      'Знаменатель относится только к отобранным элементам.',
    ],
    [
      'Как инициализировать максимум при отрицательных данных?',
      'Первым подходящим значением',
      'Нулём без дополнительных проверок',
      'Ноль может оказаться больше всех подходящих значений.',
    ],
  ],
  testing: [
    [
      'Какой тест выявит пропуск последней соседней пары?',
      'Подходит только последняя пара',
      'Все значения одинаковы и не подходят',
      'Проверяй границу обхода, а не только обычный пример.',
    ],
    [
      'Как проверить обработку разделителя 0?',
      'Дать сразу 0 и убедиться, что он не обработан',
      'Обязательно добавить число после 0',
      'Сигнал окончания не является элементом последовательности.',
    ],
    [
      'Что доказывает успешный пример из условия?',
      'Только правильность на этом вводе',
      'Правильность на любых данных',
      'Нужны другие тесты и обоснование алгоритма.',
    ],
  ],
};
export function codingQuestion(
  topic: CodingTopic,
  index: number,
): ChoiceQuestion {
  if (!Number.isInteger(index) || index < 0 || index > 4)
    throw new RangeError('Нет вопроса.');
  let row: readonly [string, string, string, string];
  if (index < 3) {
    const item = concepts[topic][index];
    if (!item) throw new RangeError('Нет вопроса.');
    row = item;
  } else {
    const source = codingExample(topic, index - 3);
    if (source.taskNumber === 15) {
      const kind = source.generatorId.slice(0, -3) as RobotKind;
      const field = robotExample(kind, source.seed);
      const next = { row: field.start.row, column: field.start.column + 1 };
      type Cell = typeof field.start;
      const same = (a: Cell, b: Cell) =>
        a.row === b.row && a.column === b.column;
      const free =
        next.column < field.columns &&
        !field.walls.some(
          ({ from, to }) =>
            (same(from, field.start) && same(to, next)) ||
            (same(to, field.start) && same(from, next)),
        );
      const yes = 'Да, справа свободно';
      const no = 'Нет, справа стена или край поля';
      row =
        index === 3
          ? [
              `Пример ${String(index - 2)}: сколько клеток помечено целевыми кругами?`,
              String(field.targets.length),
              String(field.targets.length + 1),
              'Количество вычислено по целевым клеткам исходного поля; считать нужно клетки, не шаги интерпретатора.',
            ]
          : [
              `Пример ${String(index - 2)}: истинен ли датчик «справа свободно» в начальном положении Робота?`,
              free ? yes : no,
              free ? no : yes,
              'Ответ вычислен по соседней клетке и стенам исходного поля. Датчик не перемещает Робота; проверяй именно правую сторону от текущего положения.',
            ];
    } else {
      const kind = source.generatorId.slice(0, -3) as ProgramKind;
      const cases = programCases(
        programParameters(kind, source.seed),
        source.seed,
      );
      const item = cases[index === 3 ? 0 : 1];
      if (!item) throw new RangeError('Нет входных данных.');
      row = [
        `Пример ${String(index - 2)}. Тест «${item.label}», вход по строкам: ${item.input.trim().replaceAll('\n', '; ')}. Каков вывод его программы?`,
        item.output.trim(),
        'Выводить ничего не нужно',
        'Результат вычислен независимым решателем по исходным данным; условие и эталон находятся в соответствующем примере.',
      ];
    }
  }
  return {
    kind: 'choice',
    prompt: row[0],
    options: [
      { id: 'correct', text: row[1] },
      { id: 'wrong', text: row[2] },
    ],
    correctId: 'correct',
    explanation: row[3],
  };
}
