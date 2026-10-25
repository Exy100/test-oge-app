import type { StreamReference } from '../../core/stream/schemas';
import { resolveStreamTask } from '../../core/stream/catalog';
import { getDocumentSet, getPresentationSet } from '../../core/banks';
import { deckFor } from '../../core/banks/slide-layout';
import {
  sheetData,
  sheetAnswers,
  sheetQuestions,
  sheetFormulas,
  type SheetKind,
} from '../../core/generators/14/exam-spreadsheets';
import { sitePath } from '../site';
import type { ChoiceQuestion } from './quiz';
export const officeExamples = {
  documents: ['D01', 'D02', 'D03'].map((seed) => ({
    generatorId: 'curated-documents-v2',
    taskNumber: 13,
    seed,
  })),
  presentations: ['P01', 'P02', 'P11'].map((seed) => ({
    generatorId: 'curated-presentations-v2',
    taskNumber: 13,
    seed,
  })),
  sheets: ['sheet-count-range', 'sheet-sum-mean', 'sheet-count-mean'].map(
    (kind) => ({
      generatorId: kind + '-v2',
      taskNumber: 14,
      seed: 'lesson-' + kind,
    }),
  ),
} satisfies Record<string, StreamReference[]>;
export function officeExample(
  family: keyof typeof officeExamples,
  index: number,
): StreamReference {
  const source = officeExamples[family][index];
  if (!source) throw new RangeError('Учебный пример не найден.');
  return source;
}
export const officeSources = Object.values(officeExamples).flat();
export function officeArchiveKey(source: StreamReference) {
  return source.generatorId + '.' + source.seed;
}
export function officeArchiveHref(source: StreamReference) {
  return officeSources.some(
    (item) =>
      officeArchiveKey(item) === officeArchiveKey(source) &&
      item.taskNumber === source.taskNumber,
  )
    ? sitePath('/materials/files/office/' + officeArchiveKey(source) + '.zip')
    : undefined;
}
export function officeQuestion(
  topic: 'text' | 'table' | 'slides' | 'references' | 'selection' | 'chart',
  index: number,
): ChoiceQuestion {
  if (!Number.isInteger(index) || index < 0 || index > 4)
    throw new RangeError('Вопрос должен иметь номер от 0 до 4.');
  const source = (
    topic === 'text' || topic === 'table'
      ? officeExamples.documents
      : topic === 'slides'
        ? officeExamples.presentations
        : officeExamples.sheets
  )[index % 3];
  if (!source) throw new RangeError('Нет источника вопроса.');
  const task = resolveStreamTask(source);
  let row: readonly [string, string, string, string];
  if (topic === 'text' || topic === 'table') {
    const set = getDocumentSet(source.seed),
      prefix = `Набор ${set.id}, «${set.title}». `;
    const rows: readonly (readonly [string, string, string, string])[] =
      topic === 'text'
        ? [
            [
              'Какой размер имеет основной текст?',
              `${String(set.format.bodySize)} пт`,
              'Размер заголовка 40 пт',
              'В этом наборе весь текст, включая заголовок, имеет единый размер по условию.',
            ],
            [
              'Как задать отступ первой строки?',
              `Свойством абзаца: ${String(set.format.indent)} см`,
              'Набрать пробелы перед первой буквой',
              'Параметр абзаца сохраняется при изменении строк; пробелы его не заменяют.',
            ],
            [
              'Как выровнять основной текст?',
              'По ширине',
              'По центру',
              'Основной текст и заголовок имеют разные настройки выравнивания.',
            ],
            [
              'Как задать расстояние между абзацами?',
              'Интервалом абзаца',
              'Пустыми абзацами',
              'Лишние абзацы изменяют структуру документа.',
            ],
            [
              'Что сдать и проверить после сохранения?',
              'Редактируемый ODT, открыв его повторно',
              'Только снимок экрана документа',
              'В №13.2 требуется документ ODT; снимок не сохраняет структуру текста и таблицы.',
            ],
          ]
        : [
            [
              'Какова суммарная ширина столбцов?',
              `${String(set.format.widths.reduce((a, b) => a + b, 0))} см`,
              `${String(set.format.widths.reduce((a, b) => a + b, 0) + 2)} см`,
              'Ширина таблицы складывается из ширин столбцов и в этом наборе меньше ширины основного текста.',
            ],
            [
              'Как расположить таблицу на странице?',
              'По центру',
              'У левого поля',
              'Положение таблицы задаётся свойствами таблицы, а не пробелами.',
            ],
            [
              'Нужно ли объединить строки заголовков разделов?',
              set.family === 'instructions'
                ? 'Нет: два самостоятельных заголовка столбцов'
                : 'Да: строка заголовка занимает два столбца',
              set.family === 'instructions'
                ? 'Да: объединить все строки'
                : 'Нет: заменить объединение пробелами',
              'Проверь семейство и визуальный образец: разные макеты требуют разных объединений.',
            ],
            [
              'Как задать вертикальное выравнивание ячеек?',
              'По центру',
              'По верхнему краю',
              'Не путай вертикальное выравнивание с горизонтальным расположением текста.',
            ],
            [
              'Чем сделать таблицу редактируемой?',
              'Настоящими ячейками и объединениями',
              'Картинкой с нарисованными границами',
              'Изображение не сохраняет структуру таблицы.',
            ],
          ];
    const item = rows[index];
    if (!item) throw new RangeError('Нет вопроса.');
    row = [prefix + item[0], item[1], item[2], item[3]];
  } else if (topic === 'slides') {
    const set = getPresentationSet(source.seed),
      deck = deckFor(set),
      second =
        deck[1]?.frames.filter((frame) => frame.kind === 'image').length ?? 0,
      third =
        deck[2]?.frames.filter((frame) => frame.kind === 'image').length ?? 0;
    const rows: readonly (readonly [string, string, string, string])[] = [
      [
        'Сколько слайдов нужно?',
        String(deck.length),
        String(deck.length + 1),
        'Проверь структуру: титул и два содержательных слайда.',
      ],
      [
        'Сколько изображений на слайдах 2 и 3?',
        `${String(second)} и ${String(third)}`,
        `${String(third)} и ${String(second)}`,
        'Число и взаимное расположение объектов задаются макетом.',
      ],
      [
        'Как менять размер изображения?',
        'Сохраняя отношение ширины к высоте',
        'Растягивая ширину и высоту независимо',
        'Независимое растяжение искажает пропорции.',
      ],
      [
        'Что относится к читаемости?',
        'Текст помещается в рамках; заданные размеры шрифта сохранены',
        'Любой текст можно уменьшить до нечитаемого размера',
        'Сравни расположение и читаемость на каждом слайде, затем открой сохранённый файл.',
      ],
      [
        'Какой файл сохраняет слайды редактируемыми?',
        'ODP',
        'Только PNG',
        'В этой работе нужен файл презентации, а не только изображения слайдов.',
      ],
    ];
    const item = rows[index];
    if (!item) throw new RangeError('Нет вопроса.');
    row = [
      `Набор ${set.id}, «${set.title}». ` + item[0],
      item[1],
      item[2],
      item[3],
    ];
  } else {
    const kind = source.generatorId.replace(/-v2$/u, '') as SheetKind,
      d = sheetData(kind, source.seed),
      a = sheetAnswers(d),
      q = sheetQuestions(d),
      last = String.fromCharCode(64 + d.headers.length),
      format = (value: number) => String(value).replace('.', ',');
    const meanFormat = (value: number) =>
      (kind === 'sheet-count-range'
        ? String(value)
        : value.toFixed(kind === 'sheet-sum-mean' ? 1 : 2)
      ).replace('.', ',');
    const rows: readonly (readonly [string, string, string, string])[] = [
      [
        `В наборе ${String(d.rows.length)} записей и строка заголовков. Каков полный диапазон данных?`,
        `A2:${last}${String(d.rows.length + 1)}`,
        `A1:${last}${String(d.rows.length)}`,
        'Заголовок находится в строке 1; первая запись в строке 2, последняя на единицу больше числа записей.',
      ],
      [
        q[0],
        format(a.values[0]),
        format(a.values[0] + 1),
        'Вычисли по исходным данным из ZIP; проверь все условия и границы диапазона. Это отдельный учебный расчёт, а не балл за файл.',
      ],
      [
        q[1],
        meanFormat(a.values[1]),
        meanFormat(a.values[1] + 1),
        'Для среднего сумма и количество относятся к одной выборке; округление берётся из условия. Для размаха нужны максимум и минимум требуемого столбца.',
      ],
      [
        'Какие значения нужны для диаграммы этого набора?',
        a.labels
          .map((label, i) => `${label}: ${String(a.chart[i])}`)
          .join('; '),
        `Первый ответ ${format(a.values[0])}, второй ответ ${format(a.values[1])}`,
        'Два вычисленных ответа не заменяют численности категорий. Диаграмма имеет собственный источник.',
      ],
      [
        'Что должно остаться в результате работы?',
        'ODS с исходными данными, двумя расчётами и редактируемой диаграммой с легендой и значениями',
        'Только два числа в TXT',
        'В №14 три элемента оценки; мини-тест не проверяет весь офисный файл.',
      ],
    ];
    const item = rows[index];
    if (!item) throw new RangeError('Нет вопроса.');
    row = [`Набор ${source.seed}. ` + item[0], item[1], item[2], item[3]];
  }
  const options = [
    { id: 'correct', text: row[1] },
    { id: 'wrong', text: row[2] },
  ];
  if (index % 2 === 1) options.reverse();
  if (task.answer.type !== 'artifact')
    throw new TypeError('Ожидается офисная работа.');
  return {
    kind: 'choice',
    prompt: row[0],
    options,
    correctId: 'correct',
    explanation: row[3],
  };
}

export function officeGuidance(
  topic: Parameters<typeof officeQuestion>[0],
  index: number,
): string[] {
  const family =
    topic === 'text' || topic === 'table'
      ? 'documents'
      : topic === 'slides'
        ? 'presentations'
        : 'sheets';
  const source = officeExample(family, index),
    task = resolveStreamTask(source);
  if (family === 'documents') {
    const set = getDocumentSet(source.seed),
      f = set.format;
    return [
      `Открой source/material.odt и layout/sample.pdf для **${set.id}**. Создай документ A4 с полями 2 см; перенеси заголовок «${set.title}» и два абзаца без изменений.`,
      `Задай всему тексту ${String(f.bodySize)} пт, единый шрифт. Заголовок — по центру; абзацы — по ширине, первая строка ${String(f.indent)} см, межстрочный интервал ${String(f.lineHeight)}%, интервалы между частями 14 пт. Выделения сверяй с PDF.`,
      `Таблица имеет два столбца шириной ${f.widths.map(String).join(' и ')} см и ${String(set.rows.length)} строк данных. ${set.family === 'instructions' ? 'Два самостоятельных заголовка столбцов не объединяются.' : set.family === 'sections' ? 'Строки «' + set.headers.join('') + '» и «' + set.sectionTitle + '» объединяются на два столбца.' : 'Общий заголовок «' + set.headers.join('') + '» объединяется на два столбца.'} Не заменяй объединение скрытой границей или пробелами.`,
      `Размести таблицу по центру страницы; ячейки по вертикали — по центру. ${set.family === 'sections' ? 'Первый столбец по центру, второй слева.' : 'Первый столбец слева, второй по центру.'} Сверь строки по порядку: ${set.rows.map((row) => row.join(' — ')).join('; ')}.`,
      `Сохрани **${set.id}.odt**, открой повторно и сравни текст, таблицу, выделения и печатный вид. В reference/answer.odt находится настоящий редактируемый эталон; сравнение проводится по группам требований, а не по числу галочек.`,
    ];
  }
  if (family === 'presentations') {
    const set = getPresentationSet(source.seed),
      deck = deckFor(set);
    return [
      `Открой исходный ODT, изображения и три макета набора **${set.id}**. Создай ${String(deck.length)} слайда 16:9 без анимации; единый шрифт, титул 40 пт, подзаголовок/заголовки 24 пт, основной текст 20 пт.`,
      `Титул: «${set.title}»; в подзаголовке только учебный идентификатор **${set.id}**. Личные данные не требуются. Проверь, что весь заголовок помещается в рамке.`,
      `Слайд 2: «${set.secondTitle}». Сверху изображение слева и текст справа, снизу текст слева и изображение справа. Текстовые блоки: ${set.points.join(' ')} Сохрани пропорции двух иллюстраций.`,
      `Слайд 3: «${set.thirdTitle}». Верхний ряд — текст, изображение, текст; нижний — изображение, текст, изображение. Подписи: ${set.captions.join(' ')} Проверь все три иллюстрации и связь каждой подписи с её объектом.`,
      `Сохрани **${set.id}.odp** и открой заново. Проверь три слайда, размеры шрифта, читаемость, границы и отсутствие искажения изображений. Затем при необходимости сравни с reference/answer.odp.`,
    ];
  }
  const kind = source.generatorId.replace(/-v2$/u, '') as SheetKind,
    d = sheetData(kind, source.seed),
    a = sheetAnswers(d),
    q = sheetQuestions(d),
    formulas = sheetFormulas(d).map((formula) =>
      formula
        .replace('of:=', '=')
        .replace(/\[\.([A-Z]+\d+):\.([A-Z]+\d+)\]/gu, '$1:$2'),
    );
  const mean =
    kind === 'sheet-count-range'
      ? String(a.values[1])
      : a.values[1]
          .toFixed(kind === 'sheet-sum-mean' ? 1 : 2)
          .replace('.', ',');
  if (task.answer.type !== 'artifact')
    throw new TypeError('Нужна практическая работа.');
  return [
    `Открой source/data.ods: ${String(d.rows.length)} записей, заголовок в строке 1, данные A2:${String.fromCharCode(64 + d.headers.length)}${String(d.rows.length + 1)}. ${topic === 'references' ? 'Крайние ячейки диапазона включены; формула не должна пропускать последнюю запись.' : topic === 'selection' ? 'Отдельно выпиши условия двух расчётов: выборки могут различаться.' : 'Сначала выдели область и категории третьего пункта, независимо от двух числовых ответов.'}`,
    `${q[0]} Формула для H2: \`${formulas[0] ?? ''}\`. Результат: **${String(a.values[0])}**. ${kind === 'sheet-sum-mean' ? 'Суммируются перевозки трёх перечисленных дней включительно.' : 'Все признаки должны выполняться одновременно в одной строке; строгое сравнение сохраняется.'}`,
    `${q[1]} Формула для H3: \`${formulas[1] ?? ''}\`. Результат: **${mean}**. ${kind === 'sheet-count-range' ? 'Максимум и минимум берутся по всем участникам из столбца правой руки.' : 'Среднее использует только требуемую группу, включая нулевые значения; ROUND задаёт округление по условию.'}`,
    `${q[2]} Подготовь таблицу J2:K4: ${a.labels.map((label, i) => label + ' — ' + String(a.chart[i])).join('; ')}. Формулы численностей: ${formulas
      .slice(2)
      .map((formula) => '`' + formula + '`')
      .join('; ')}. Два предыдущих ответа не являются источником диаграммы.`,
    `Вставь круговую диаграмму по категориям и численностям, добавь легенду и исходные значения, размести вблизи G6. Сохрани result.ods, повторно открой и проверь оба расчёта и редактируемую диаграмму. Три элемента оцениваются отдельно; эти разборы не являются автоматической экспертизой файла.`,
  ];
}
