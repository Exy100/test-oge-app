import { runRobot, RobotSyntaxError } from '../../robot/index.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';
import {
  fieldFor,
  robotCases,
  robotExample,
  robotKinds,
  type RobotKind,
} from './fields.ts';
export const robotDatasetId = (kind: RobotKind, seed: string): string =>
  `${kind}-v1:files:${seed}`;
const paintByWall = 'если слева стена то\n  закрасить\nвсе';
const tooth =
  'нц пока сверху свободно\n  вверх\n  закрасить\nкц\nнц пока снизу свободно\n  вниз\nкц';
export const robotPrograms: Readonly<Record<RobotKind, string>> = {
  'robot-corridor':
    'закрасить\nнц пока справа свободно\n  вправо\n  закрасить\nкц',
  'robot-wall-gaps': `${paintByWall}\nнц пока сверху свободно\n  вверх\n${paintByWall}\nкц`,
  'robot-comb': `нц пока справа свободно\n${tooth}\n  вправо\nкц\n${tooth}`,
  'robot-room':
    'закрасить\nнц пока справа свободно\n  вправо\n  закрасить\nкц\nнц пока снизу свободно\n  вниз\n  закрасить\n  нц пока слева свободно\n    влево\n    закрасить\n  кц\n  если снизу свободно то\n    вниз\n    закрасить\n    нц пока справа свободно\n      вправо\n      закрасить\n    кц\n  все\nкц',
};
export function referenceProgram(kind: RobotKind): string {
  return `использовать Робот\nалг\nнач\n${robotPrograms[kind]}\nкон\n`;
}
export function assessRobot(kind: RobotKind, seed: string, source: string) {
  try {
    const results = robotCases(kind, seed).map((parameters) => {
      const result = runRobot(source, fieldFor(parameters), {
        maxSteps: 5000,
        traceLimit: 0,
      });
      return {
        status: result.status,
        success: result.success,
        steps: result.steps,
        position: result.position,
        painted: result.painted,
      };
    });
    const passed = results.filter((result) => result.success).length;
    const score: 0 | 1 | 2 = passed === results.length ? 2 : passed > 0 ? 1 : 0;
    return { score, passed, total: results.length, results, error: '' };
  } catch (error) {
    if (!(error instanceof RobotSyntaxError)) throw error;
    return {
      score: 0 as const,
      passed: 0,
      total: robotCases(kind, seed).length,
      results: [],
      error: error.message,
    };
  }
}
const rules: Record<RobotKind, string> = {
  'robot-corridor':
    'Робот находится в левой крайней клетке горизонтального коридора длиной от 1 до 12 клеток. Сверху и снизу коридор ограничен стенами, на концах — стены; за стенами могут быть другие клетки поля. Закрась все клетки коридора.',
  'robot-wall-gaps':
    'Робот находится в нижней клетке вертикального пути длиной от 1 до 12 клеток. Путь продолжается строго вверх до верхней границы поля, в этом столбце внутренних горизонтальных стен нет. Слева от каждой клетки пути может быть стена или проход; справа есть хотя бы одна клетка или граница, на алгоритм это не влияет. Закрась только клетки пути, слева от которых стена. Слева от пути всегда есть отдельный столбец: границу поля нельзя спутать со стеной. Допустимы отсутствие стен, сплошная стена и произвольное расположение проходов.',
  'robot-comb':
    'Робот находится в левой клетке нижнего горизонтального основания «гребёнки». Основание содержит от 1 до 10 клеток и ограничено снизу и на концах стенами. Из каждой клетки основания вверх ведёт зубец длиной от 0 до 6 клеток до стены; между соседними зубцами стоят вертикальные стены. Закрась все клетки зубцов, не закрашивая основание. Все зубцы могут иметь длину 0.',
  'robot-room':
    'Робот находится в верхнем левом углу прямоугольной комнаты без внутренних стен. Высота и ширина комнаты — от 1 до 12 клеток независимо друг от друга. По периметру стоят стены; за ними могут быть другие клетки поля. Закрась всю комнату. Алгоритм должен работать и при чётной, и при нечётной высоте, при одной строке или одном столбце.',
};
const titles: Record<RobotKind, string> = {
  'robot-corridor': 'Закраска коридора',
  'robot-wall-gaps': 'Стена с проходами',
  'robot-comb': 'Зубцы гребёнки',
  'robot-room': 'Комната змейкой',
};
const reasoning: Record<RobotKind, readonly [string, string, string]> = {
  'robot-corridor': [
    'Закрась старт: цикл движения сам по себе его пропустит.',
    'Перед каждым шагом вправо проверяй датчик; после шага закрась новую клетку.',
    'Расстояние до правой стены уменьшается на каждом проходе цикла, поэтому он завершится и обработает последнюю клетку.',
  ],
  'robot-wall-gaps': [
    'Проверь левую стену уже в стартовой клетке. Проход — причина пропустить закраску, а не перейти в соседний столбец.',
    'Поднимайся по одной клетке, пока сверху свободно, и после каждого шага проверяй стену слева.',
    'Число оставшихся клеток сверху убывает. Ни одна клетка вне исходного столбца не посещается; проходы не закрашиваются.',
  ],
  'robot-comb': [
    'Для одного зубца поднимайся до стены, закрашивая только после шага вверх.',
    'Вернись вниз до стены под основанием; переместись вправо лишь после проверки датчика.',
    'Число зубцов справа убывает. После внешнего цикла обработай последний зубец отдельно, включая случай единственного зубца.',
  ],
  'robot-room': [
    'Пройди верхнюю строку вправо с закраской, включая старт.',
    'Если снизу свободно, спустись на строку и пройди её влево. Следующий спуск и проход вправо выполняй только при свободной клетке снизу.',
    'Каждый проход покрывает целую строку. Число строк снизу уменьшается, а проверка второго спуска защищает последнюю строку при любой чётности.',
  ],
};
function generator(kind: RobotKind): Generator {
  const build = (seed: string) => {
    const field = robotExample(kind, seed);
    return {
      ...taskFrom(kind, 15, seed, {
        statement: `${rules[kind]}\n\nВсе клетки первоначально не закрашены. Лишние клетки закрашивать нельзя; конечная позиция не задана. Используй датчики и циклы, не подставляй размеры с рисунка. Показан только один пример семейства: сетка ${String(field.rows)} × ${String(field.columns)}, старт (строка ${String(field.start.row)}, столбец ${String(field.start.column)}), индексы с 0. Данные и рисунок находятся в source; проверочные поля — в validation/fields.json.\n\nСохрани программу в answer.txt, UTF-8. Поддерживаются движения, закраска, датчики, если/иначе и нц пока; описание языка есть в README.txt. Нужно нормальное завершение без столкновений и точная закраска на всех допустимых полях семейства. Учебные критерии 0/1/2 и конечный набор проверок не заменяют официальную экспертную оценку.`,
        answer: {
          type: 'artifact',
          kind: 'robot',
          referenceId: `${kind}-v1:${seed}:reference`,
        },
        solution: reasoning[kind].map((text, index) => ({
          text,
          ...(index === 2 ? { code: referenceProgram(kind) } : {}),
        })),
        hints: [
          'Начни с датчиков и границ: размер на рисунке — только пример.',
          reasoning[kind][1],
          'Проверь короткое поле, последний участок, лишнюю закраску и завершение цикла.',
        ],
        commonMistakes: [
          {
            answer: 'fixed-moves',
            explanation:
              'Фиксированное число шагов решает один рисунок, но не семейство.',
          },
          {
            answer: 'paint-all',
            explanation:
              'Лишняя закрашенная клетка также делает результат неверным.',
          },
        ],
      }),
      datasetId: robotDatasetId(kind, seed),
      criteria: {
        max: 2 as const,
        levels: [
          {
            score: 0 as const,
            description:
              'Синтаксис не поддерживается или ни одно из восьми проверочных полей не пройдено с нормальным завершением и точной закраской.',
          },
          {
            score: 1 as const,
            description:
              'С нормальным завершением и точной закраской пройдена часть из восьми проверочных полей, но не все.',
          },
          {
            score: 2 as const,
            description:
              'Все восемь проверочных полей пройдены с нормальным завершением, без столкновений и с точной закраской.',
          },
        ],
      },
    };
  };
  return {
    id: `${kind}-v1`,
    taskNumber: 15,
    subtype: kind,
    title: titles[kind],
    generate: build,
    verify(task) {
      const expected = build(task.seed);
      return (
        task.id === expected.id &&
        task.taskNumber === 15 &&
        task.examPart === 2 &&
        task.variant13 === undefined &&
        task.generatorId === expected.generatorId &&
        task.subtype === kind &&
        task.datasetId === expected.datasetId &&
        JSON.stringify(task.answer) === JSON.stringify(expected.answer) &&
        task.statement === expected.statement &&
        JSON.stringify(task.solution) === JSON.stringify(expected.solution) &&
        JSON.stringify(task.criteria) === JSON.stringify(expected.criteria) &&
        assessRobot(kind, task.seed, referenceProgram(kind)).score === 2
      );
    },
  };
}
export const robotGenerators = robotKinds.map(generator);
