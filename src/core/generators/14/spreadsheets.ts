import { Rng } from '../../rng.ts';
import type { Generator } from '../../types.ts';
import { taskFrom } from '../task.ts';
export const sheetKinds = [
  'sheet-filter',
  'sheet-revenue',
  'sheet-group',
  'sheet-growth',
] as const;
export type SheetKind = (typeof sheetKinds)[number];
export const isSheetKind = (value: string): value is SheetKind =>
  sheetKinds.some((kind) => kind === value);
export const sheetDatasetId = (kind: SheetKind, seed: string): string =>
  `${kind}-v1:files:${seed}`;
export interface SheetData {
  headers: readonly string[];
  rows: readonly (readonly [number, string, number, number])[];
  group: string;
  threshold: number;
}
export function sheetData(kind: SheetKind, seed: string): SheetData {
  const rng = new Rng(`${kind}:${seed}`);
  const groups =
    kind === 'sheet-revenue'
      ? ['Бумага', 'Краски', 'Кисти']
      : kind === 'sheet-growth'
        ? ['Север', 'Центр', 'Юг']
        : ['Альфа', 'Бета', 'Гамма'];
  const group = rng.pick(groups);
  const rows = Array.from(
    { length: 240 },
    (_, i): [number, string, number, number] => [
      i + 1,
      groups[i % 3] ?? group,
      kind === 'sheet-filter'
        ? rng.int(7, 9)
        : kind === 'sheet-revenue'
          ? rng.int(5, 40) * 10
          : rng.int(20, 80),
      kind === 'sheet-revenue' ? rng.int(1, 12) : rng.int(20, 100),
    ],
  );
  return {
    headers:
      kind === 'sheet-filter'
        ? ['ID', 'Кружок', 'Класс', 'Баллы']
        : kind === 'sheet-revenue'
          ? ['ID', 'Категория', 'Цена, руб.', 'Количество, шт.']
          : kind === 'sheet-group'
            ? ['ID', 'Команда', 'Тест 1', 'Тест 2']
            : ['ID', 'Район', 'До, ед.', 'После, ед.'],
    rows: rng.shuffle(rows),
    group,
    threshold: rng.int(8, 9),
  };
}
export function selected(
  kind: SheetKind,
  data: SheetData,
  row: readonly [number, string, number, number],
): boolean {
  return (
    row[1] === data.group &&
    (kind === 'sheet-filter'
      ? row[2] >= data.threshold
      : kind === 'sheet-growth'
        ? row[3] > row[2]
        : true)
  );
}
export function measure(
  kind: SheetKind,
  row: readonly [number, string, number, number],
): number {
  return kind === 'sheet-revenue'
    ? row[2] * row[3]
    : kind === 'sheet-group'
      ? row[2] + row[3]
      : kind === 'sheet-growth'
        ? row[3] - row[2]
        : row[3];
}
export function sheetAnswers(
  kind: SheetKind,
  data: SheetData,
): readonly [number, number, number] {
  const values = data.rows
    .filter((row) => selected(kind, data, row))
    .map((row) => measure(kind, row));
  if (!values.length) throw new Error('Нет строк для расчёта.');
  const sum = values.reduce((a, b) => a + b, 0);
  return [
    values.length,
    kind === 'sheet-group'
      ? Math.floor((sum * 100 + values.length / 2) / values.length) / 100
      : sum,
    Math.max(...values),
  ];
}
export function sheetQuestions(
  kind: SheetKind,
  data: SheetData,
): readonly [string, string, string] {
  const condition =
    kind === 'sheet-filter'
      ? `кружок «${data.group}», класс не меньше ${String(data.threshold)}`
      : kind === 'sheet-growth'
        ? `район «${data.group}», показатель после строго больше показателя до`
        : `${kind === 'sheet-revenue' ? 'категория' : 'команда'} «${data.group}»`;
  return [
    `Количество записей: ${condition}.`,
    kind === 'sheet-revenue'
      ? 'Суммарная выручка этих записей (цена × количество), в рублях.'
      : kind === 'sheet-group'
        ? 'Средний суммарный балл двух тестов среди этих записей, округлённый до двух знаков после запятой.'
        : kind === 'sheet-growth'
          ? 'Суммарный прирост (после − до) только этих записей, в единицах.'
          : 'Сумма баллов этих записей.',
    kind === 'sheet-revenue'
      ? 'Максимальная выручка одной из этих записей, в рублях.'
      : kind === 'sheet-group'
        ? 'Максимальный суммарный балл двух тестов среди этих записей.'
        : kind === 'sheet-growth'
          ? 'Максимальный прирост одной из этих записей, в единицах.'
          : 'Максимальный балл среди этих записей.',
  ];
}
export function helperFormula(
  kind: SheetKind,
  data: SheetData,
  row: number,
): string {
  const r = String(row);
  const condition =
    kind === 'sheet-filter'
      ? `AND([.B${r}]="${data.group}";[.C${r}]>=${String(data.threshold)})`
      : kind === 'sheet-growth'
        ? `AND([.B${r}]="${data.group}";[.D${r}]>[.C${r}])`
        : `[.B${r}]="${data.group}"`;
  const value =
    kind === 'sheet-revenue'
      ? `[.C${r}]*[.D${r}]`
      : kind === 'sheet-group'
        ? `[.C${r}]+[.D${r}]`
        : kind === 'sheet-growth'
          ? `[.D${r}]-[.C${r}]`
          : `[.D${r}]`;
  return `of:=IF(${condition};${value};0)`;
}
export function resultFormulas(
  kind: SheetKind,
  data: SheetData,
): readonly [string, string, string] {
  const end = String(data.rows.length + 1),
    b = `[.B2:.B${end}]`,
    c = `[.C2:.C${end}]`,
    e = `[.E2:.E${end}]`;
  const count =
    kind === 'sheet-filter'
      ? `COUNTIFS(${b};"${data.group}";${c};">=${String(data.threshold)}")`
      : kind === 'sheet-growth'
        ? `COUNTIF(${e};">0")`
        : `COUNTIF(${b};"${data.group}")`;
  return [
    `of:=${count}`,
    kind === 'sheet-group' ? `of:=ROUND(SUM(${e})/[.H2];2)` : `of:=SUM(${e})`,
    `of:=MAX(${e})`,
  ];
}
const titles: Record<SheetKind, string> = {
  'sheet-filter': 'Отбор по двум условиям',
  'sheet-revenue': 'Выручка по категории',
  'sheet-group': 'Средние результаты команды',
  'sheet-growth': 'Сравнение двух этапов',
};
function generator(kind: SheetKind): Generator {
  const build = (seed: string) => {
    const data = sheetData(kind, seed),
      answers = sheetAnswers(kind, data),
      questions = sheetQuestions(kind, data),
      formulas = resultFormulas(kind, data);
    return {
      ...taskFrom(kind, 14, seed, {
        statement: `Открой source/data.ods: лист «Данные», заголовки в A1:D1, ${String(data.rows.length)} записей в A2:D${String(data.rows.length + 1)}. Каждый ID — отдельная запись.\n\nВыполни три связанных запроса:\n${questions.map((q, i) => `${String(i + 1)}. ${q}`).join('\n')}\n\nЗапиши ответы в H2, H3, H4 по порядку. Для вычислений можно использовать E и другие свободные столбцы; исходные A:D не меняй. Не включай заголовки и ячейки ответов в диапазоны. Сохрани result.ods с формулами и исходными данными. Это авторское учебное задание; критерии 0–3 предназначены для самооценки и не заменяют официальную экспертную проверку.`,
        answer: {
          type: 'artifact',
          kind: 'spreadsheet',
          referenceId: `${kind}-v1:${seed}:reference`,
        },
        solution: [
          {
            text: `Проверь исходные столбцы и выдели строки по условию первого запроса. Формула H2 в записи OpenFormula: ${formulas[0]}. Ответ: ${String(answers[0])}.`,
          },
          {
            text: `В E2 запиши ${helperFormula(kind, data, 2)} и протяни до E${String(data.rows.length + 1)}. Для H3 используй ${formulas[1]}. Ответ: ${String(answers[1])}.`,
          },
          {
            text: `В H4 запиши ${formulas[2]}. Ответ: ${String(answers[2])}. Открой сохранённый result.ods повторно и сравни три результата. В интерфейсе Calc имена функций могут быть локализованы; of:= и квадратные скобки — запись внутри ODS.`,
          },
        ],
        hints: [
          'Сначала проверь заголовки, первую и последнюю строки данных.',
          'Вспомогательный столбец позволяет отдельно проверить условие и вычисление для каждой строки.',
          'Счётчик, сумма и максимум должны учитывать одну и ту же выбранную группу записей.',
        ],
        commonMistakes: [
          {
            answer: 'all-rows',
            explanation:
              'Обработка всех строк вместо отбора по заданному условию.',
          },
          {
            answer: 'wrong-range',
            explanation:
              'Диапазон включает заголовок или пропускает последнюю запись.',
          },
        ],
      }),
      datasetId: sheetDatasetId(kind, seed),
      criteria: {
        max: 3 as const,
        levels: [
          {
            score: 0 as const,
            description:
              'ODS отсутствует или не открывается либо ни один из трёх результатов не верен.',
          },
          {
            score: 1 as const,
            description:
              'ODS открывается, исходные данные сохранены; верен один из трёх результатов.',
          },
          {
            score: 2 as const,
            description:
              'ODS открывается, исходные данные сохранены; верны два из трёх результатов.',
          },
          {
            score: 3 as const,
            description:
              'ODS открывается, исходные данные сохранены; верны все три результата.',
          },
        ],
      },
    };
  };
  return {
    id: `${kind}-v1`,
    taskNumber: 14,
    subtype: kind,
    title: titles[kind],
    generate: build,
    verify(task) {
      const expected = build(task.seed);
      if (
        task.taskNumber !== 14 ||
        task.id !== expected.id ||
        task.examPart !== 2 ||
        task.variant13 !== undefined ||
        task.generatorId !== expected.generatorId ||
        task.subtype !== kind ||
        task.datasetId !== expected.datasetId ||
        task.statement !== expected.statement ||
        task.answer.type !== 'artifact' ||
        task.answer.kind !== 'spreadsheet' ||
        expected.answer.type !== 'artifact' ||
        task.answer.referenceId !== expected.answer.referenceId ||
        JSON.stringify(task.criteria) !== JSON.stringify(expected.criteria) ||
        JSON.stringify(task.solution) !== JSON.stringify(expected.solution)
      )
        return false;
      // Independent accumulation avoids the filter/map/reduce path used to construct answers.
      const data = sheetData(kind, task.seed);
      let count = 0,
        sum = 0,
        max = 0;
      for (const row of data.rows) {
        if (row[1] !== data.group) continue;
        if (kind === 'sheet-filter' && row[2] < data.threshold) continue;
        if (kind === 'sheet-growth' && row[3] <= row[2]) continue;
        count++;
        let value = row[3];
        if (kind === 'sheet-revenue') value = row[2] * row[3];
        if (kind === 'sheet-group') value = row[2] + row[3];
        if (kind === 'sheet-growth') value = row[3] - row[2];
        sum += value;
        if (value > max) max = value;
      }
      const middle =
        kind === 'sheet-group' ? Math.round((sum * 100) / count) / 100 : sum;
      return (
        JSON.stringify(sheetAnswers(kind, data)) ===
        JSON.stringify([count, middle, max])
      );
    },
  };
}
export const spreadsheetGenerators = sheetKinds.map(generator);
