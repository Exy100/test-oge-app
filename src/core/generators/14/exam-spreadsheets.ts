import { Rng } from '../../rng.ts';
import type { Generator, TaskInstance } from '../../types.ts';
import { spreadsheetCriteria } from '../../office/rubrics.ts';
import { taskFrom } from '../task.ts';
export const sheetKinds = [
  'sheet-count-range',
  'sheet-sum-mean',
  'sheet-count-mean',
] as const;
export type SheetKind = (typeof sheetKinds)[number];
export type DataCell = string | number;
export interface SheetData {
  kind: SheetKind;
  headers: readonly string[];
  rows: readonly (readonly DataCell[])[];
  group: string;
  sex: string;
  startDay: number;
  grade: number;
  threshold: number;
}
export interface SheetAnswers {
  values: readonly [number, number];
  chart: readonly number[];
  labels: readonly string[];
}
export function sheetData(kind: SheetKind, seed: string): SheetData {
  const rng = new Rng(`${kind}-v2:${seed}`);
  const group =
    kind === 'sheet-count-range'
      ? rng.pick(['пенсионер', 'студент', 'служащий'])
      : kind === 'sheet-sum-mean'
        ? rng.pick(['Липки', 'Орехово', 'Осинки'])
        : String(rng.int(1, 50));
  const sex = rng.pick(['жен', 'муж']),
    startDay = rng.int(5, 7),
    grade = rng.int(7, 9),
    threshold = rng.int(160, 240);
  const rows = Array.from(
    { length: kind === 'sheet-sum-mean' ? 370 : 1000 },
    (_, i): DataCell[] => {
      if (kind === 'sheet-count-range')
        return [
          `участник ${String(i + 1)}`,
          rng.pick(['жен', 'муж']),
          ['пенсионер', 'студент', 'служащий'][i % 3] ?? 'студент',
          rng.int(20, 80),
          rng.int(20, 80),
        ];
      if (kind === 'sheet-sum-mean')
        return [
          `${String(1 + Math.floor((i * 9) / 370))} октября`,
          rng.pick(['Липки', 'Орехово', 'Осинки']),
          rng.pick(['Берёзки', 'Дубки', 'Вязово']),
          rng.int(50, 600),
          rng.int(10, 100),
          rng.int(10, 100) * 10,
        ];
      return [
        `участник ${String(i + 1)}`,
        1 + (i % 50),
        rng.int(7, 9),
        rng.int(0, 400),
      ];
    },
  );
  return {
    kind,
    group,
    sex,
    startDay,
    grade,
    threshold,
    rows: kind === 'sheet-sum-mean' ? rows : rng.shuffle(rows),
    headers:
      kind === 'sheet-count-range'
        ? ['номер участника', 'пол', 'статус', 'левая рука', 'правая рука']
        : kind === 'sheet-sum-mean'
          ? [
              'Дата',
              'Пункт отправления',
              'Пункт назначения',
              'Расстояние',
              'Расход бензина',
              'Масса груза',
            ]
          : ['номер участника', 'номер школы', 'класс', 'баллы'],
  };
}
export function sheetAnswers(d: SheetData): SheetAnswers {
  if (!d.rows.length) throw new Error('Пустая таблица.');
  if (d.kind === 'sheet-count-range') {
    const values = d.rows.map((r) => Number(r[4]));
    const labels = ['пенсионер', 'студент', 'служащий'];
    return {
      values: [
        d.rows.filter((r) => r[1] === d.sex && r[2] === d.group).length,
        Math.max(...values) - Math.min(...values),
      ],
      labels,
      chart: labels.map(
        (label) =>
          d.rows.filter((r) => r[1] === d.sex && r[2] === label).length,
      ),
    };
  }
  if (d.kind === 'sheet-sum-mean') {
    const selected = d.rows
      .filter((r) => r[1] === d.group)
      .map((r) => Number(r[5]));
    if (!selected.length) throw new Error('Нет строк для среднего.');
    const labels = ['1 октября', '2 октября', '3 октября'];
    return {
      values: [
        d.rows
          .filter(
            (r) =>
              Number(String(r[0]).split(' ')[0]) >= d.startDay &&
              Number(String(r[0]).split(' ')[0]) <= d.startDay + 2,
          )
          .reduce((n, r) => n + Number(r[3]), 0),
        Math.round(
          (selected.reduce((a, b) => a + b, 0) / selected.length) * 10,
        ) / 10,
      ],
      labels,
      chart: labels.map((label) => d.rows.filter((r) => r[0] === label).length),
    };
  }
  const selected = d.rows
    .filter((r) => r[1] === Number(d.group))
    .map((r) => Number(r[3]));
  if (!selected.length) throw new Error('Нет строк для среднего.');
  const labels = ['7 класс', '8 класс', '9 класс'];
  return {
    values: [
      d.rows.filter((r) => r[2] === d.grade && Number(r[3]) > d.threshold)
        .length,
      Math.round(
        (selected.reduce((a, b) => a + b, 0) / selected.length) * 100,
      ) / 100,
    ],
    labels,
    chart: [7, 8, 9].map(
      (grade) => d.rows.filter((r) => r[2] === grade).length,
    ),
  };
}
export function sheetFormulas(
  d: SheetData,
): readonly [string, string, ...string[]] {
  const end = String(d.rows.length + 1),
    col = (c: string) => `[.${c}2:.${c}${end}]`;
  if (d.kind === 'sheet-count-range')
    return [
      `of:=COUNTIFS(${col('B')};"${d.sex}";${col('C')};"${d.group}")`,
      `of:=MAX(${col('E')})-MIN(${col('E')})`,
      ...['пенсионер', 'студент', 'служащий'].map(
        (s) => `of:=COUNTIFS(${col('B')};"${d.sex}";${col('C')};"${s}")`,
      ),
    ];
  if (d.kind === 'sheet-sum-mean')
    return [
      `of:=SUM(${[0, 1, 2].map((n) => `SUMIF(${col('A')};"${String(d.startDay + n)} октября";${col('D')})`).join(';')})`,
      `of:=ROUND(AVERAGEIF(${col('B')};"${d.group}";${col('F')});1)`,
      ...[1, 2, 3].map(
        (n) => `of:=COUNTIF(${col('A')};"${String(n)} октября")`,
      ),
    ];
  return [
    `of:=COUNTIFS(${col('C')};${String(d.grade)};${col('D')};">${String(d.threshold)}")`,
    `of:=ROUND(AVERAGEIF(${col('B')};${d.group};${col('D')});2)`,
    ...[7, 8, 9].map((n) => `of:=COUNTIF(${col('C')};${String(n)})`),
  ];
}
const titles: Record<SheetKind, string> = {
  'sheet-count-range': 'Количество и размах результатов',
  'sheet-sum-mean': 'Сумма расстояний и средняя масса',
  'sheet-count-mean': 'Количество и средний балл',
};
export function sheetQuestions(
  d: SheetData,
): readonly [string, string, string] {
  return d.kind === 'sheet-count-range'
    ? [
        `Сколько участников с полом «${d.sex}» и статусом «${d.group}»?`,
        'Какова разница между максимальным и минимальным показателями для правой руки среди всех участников?',
        `Построй круговую диаграмму соотношения количества участников с полом «${d.sex}» среди пенсионеров, студентов и служащих.`,
      ]
    : d.kind === 'sheet-sum-mean'
      ? [
          `Какова суммарная протяжённость перевозок с ${String(d.startDay)} по ${String(d.startDay + 2)} октября включительно?`,
          `Какова средняя масса груза при перевозках из пункта «${d.group}»? Укажи не менее одного знака после запятой.`,
          'Построй круговую диаграмму соотношения количества перевозок 1, 2 и 3 октября.',
        ]
      : [
          `Сколько участников из ${String(d.grade)} класса набрали более ${String(d.threshold)} баллов?`,
          `Каков средний балл участников школы №${d.group}? Укажи не менее двух знаков после запятой.`,
          'Построй круговую диаграмму соотношения количества участников из 7, 8 и 9 классов.',
        ];
}
function generator(kind: SheetKind): Generator {
  const id = `${kind}-v2`;
  const build = (seed: string): TaskInstance => {
    const d = sheetData(kind, seed),
      a = sheetAnswers(d),
      f = sheetFormulas(d),
      q = sheetQuestions(d),
      last =
        d.kind === 'sheet-sum-mean'
          ? 'F'
          : d.kind === 'sheet-count-range'
            ? 'E'
            : 'D';
    return {
      ...taskFrom(kind, 14, seed, {
        statement: `В таблицу внесены ${String(d.rows.length)} записей. Открой source/data.ods: лист «Данные», заголовки A1:${last}1, записи A2:${last}${String(d.rows.length + 1)}. Столбцы по порядку: ${d.headers.join('; ')}. ${d.kind === 'sheet-sum-mean' ? 'Перевозки расположены в хронологическом порядке.' : 'Порядок записей произвольный.'}\n\n1. ${q[0]} Ответ запиши в H2.\n2. ${q[1]} Ответ запиши в H3.\n3. ${q[2]} Левый верхний угол размести вблизи G6. В поле диаграммы должны присутствовать легенда и числовые значения исходных данных.\n\nИспользуй свободные столбцы для вычислений, сохрани исходные данные и результат в result.ods. Это авторское учебное задание по подтверждённому формату ФИПИ; самооценка не заменяет экспертную проверку файла.`,
        answer: {
          type: 'artifact',
          kind: 'spreadsheet',
          referenceId: `${id}:${seed}:reference`,
        },
        solution: [
          { text: `Первый расчёт: ${f[0]}. Результат ${String(a.values[0])}.` },
          { text: `Второй расчёт: ${f[1]}. Результат ${String(a.values[1])}.` },
          {
            text: `Создай вспомогательную таблицу: ${a.labels.map((l, i) => `${l} — ${String(a.chart[i])}`).join('; ')}. Формулы: ${f.slice(2).join('; ')}. Построй круговую диаграмму по этой таблице, добавь легенду и подписи значений. Открой сохранённый ODS повторно. Имена функций Calc могут быть локализованы; of:= и квадратные скобки — запись внутри ODS.`,
          },
        ],
        hints: [
          'Проверь первую и последнюю строки диапазона; заголовок не включай.',
          'Сначала выдели условия для каждого расчёта: выборки могут различаться.',
          'Диаграмма строится по численностям категорий, а не по двум ответам; нужны значения и легенда.',
        ],
        commonMistakes: [
          {
            answer: 'wrong-range',
            explanation:
              'Заголовок включён в диапазон или последняя запись пропущена.',
          },
          {
            answer: 'chart-missing',
            explanation:
              'Третьим элементом служит круговая диаграмма, отдельное число её не заменяет.',
          },
        ],
      }),
      id: `${id}:${seed}`,
      generatorId: id,
      difficulty: kind === 'sheet-count-mean' ? 3 : 2,
      datasetId: `${id}:files:${seed}`,
      criteria: spreadsheetCriteria,
    };
  };
  return {
    id,
    subtype: kind,
    taskNumber: 14,
    title: titles[kind],
    generate: build,
    verify(task) {
      const expected = build(task.seed);
      if (
        Object.keys(task).length !== Object.keys(expected).length ||
        !Object.entries(expected).every(
          ([key, value]) =>
            JSON.stringify(Reflect.get(task, key)) === JSON.stringify(value),
        )
      )
        return false;
      const d = sheetData(kind, task.seed);
      let first = 0,
        sum = 0,
        count = 0,
        min = Infinity,
        max = -Infinity;
      const chart = [0, 0, 0];
      for (const r of d.rows) {
        if (kind === 'sheet-count-range') {
          if (r[1] === d.sex && r[2] === d.group) first++;
          min = Math.min(min, Number(r[4]));
          max = Math.max(max, Number(r[4]));
          if (r[1] === d.sex) {
            const i = ['пенсионер', 'студент', 'служащий'].indexOf(
              String(r[2]),
            );
            chart[i] = (chart[i] ?? 0) + 1;
          }
        } else if (kind === 'sheet-sum-mean') {
          const day = parseInt(String(r[0]), 10);
          if (day >= d.startDay && day <= d.startDay + 2) first += Number(r[3]);
          if (r[1] === d.group) {
            sum += Number(r[5]);
            count++;
          }
          if (day <= 3) chart[day - 1] = (chart[day - 1] ?? 0) + 1;
        } else {
          if (r[2] === d.grade && Number(r[3]) > d.threshold) first++;
          if (r[1] === Number(d.group)) {
            sum += Number(r[3]);
            count++;
          }
          const i = Number(r[2]) - 7;
          chart[i] = (chart[i] ?? 0) + 1;
        }
      }
      const second =
        kind === 'sheet-count-range'
          ? max - min
          : Math.round((sum / count) * (kind === 'sheet-sum-mean' ? 10 : 100)) /
            (kind === 'sheet-sum-mean' ? 10 : 100);
      const a = sheetAnswers(d);
      return (
        JSON.stringify([first, second]) === JSON.stringify(a.values) &&
        JSON.stringify(chart) === JSON.stringify(a.chart)
      );
    },
  };
}
export const spreadsheetGenerators = sheetKinds.map(generator);
