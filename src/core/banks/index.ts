import { documentSets, type DocumentSet } from './document-content.ts';
export { documentSets } from './document-content.ts';
export const DOCUMENT_VERSION = 'curated-documents-v1';
import type { TaskInstance } from '../types.ts';
import {
  presentationSets,
  type PresentationSet,
} from './presentation-content.ts';
export { presentationSets } from './presentation-content.ts';
export const PRESENTATION_VERSION = 'curated-presentations-v1';
export function presentationTask(set: PresentationSet): TaskInstance {
  return {
    id: `${PRESENTATION_VERSION}:${set.id}`,
    generatorId: PRESENTATION_VERSION,
    seed: set.id,
    taskNumber: 13,
    examPart: 2,
    subtype: 'presentation',
    variant13: 'presentation',
    difficulty: 2,
    topics: ['Создание презентаций', 'Размещение текста и изображений'],
    datasetId: `${PRESENTATION_VERSION}:files:${set.id}`,
    statement: `Создай презентацию «${set.title}» из трёх слайдов по макету набора. Используй исходный ODT и три авторские иллюстрации. Формат слайда — 16:9; заголовки — 30–32 пт, основной текст — не меньше 20 пт.\n\nПервый слайд: название, подзаголовок и учебный идентификатор ${set.id}. Второй: «${set.secondTitle}», два смысловых пункта и иллюстрация. Третий: «${set.thirdTitle}», два изображения с подписями. Сохраняй пропорции изображений; текст и изображения должны помещаться на слайде. Используй единое оформление. Сохрани результат как ${set.id}.odp.\n\nИмена, фамилии и контакты вводить не нужно. Это авторское учебное задание; критерии в наборе предназначены для самооценки и не заменяют официальную экспертную проверку.`,
    answer: {
      type: 'artifact',
      kind: 'presentation',
      referenceId: `${PRESENTATION_VERSION}:${set.id}:reference`,
    },
    solution: [
      {
        text: 'Открой исходный ODT, изображения и макеты. Создай три широкоформатных слайда, выбери единые шрифты и цвета.',
      },
      {
        text: `Распредели текст: титул, «${set.secondTitle}», «${set.thirdTitle}». Размести иллюстрации по макету, добавь подписи и идентификатор ${set.id}.`,
      },
      {
        text: `Сохрани ${set.id}.odp, открой файл повторно и сравни с шестью пунктами чек-листа. Проверь отсутствие обрезанного текста и искажённых изображений; затем при необходимости открой эталон.`,
      },
    ],
    hints: [
      'Начни с числа слайдов, формата страницы и заголовков.',
      'Сначала перенеси смысловые пункты, затем размещай иллюстрации с сохранением пропорций.',
      'Открой сохранённую ODP повторно и просмотри каждый слайд целиком.',
    ],
    commonMistakes: [
      {
        answer: 'pptx',
        explanation: 'В этом задании результат нужно сохранить в формате ODP.',
      },
      {
        answer: 'personal-name',
        explanation:
          'На титульном слайде нужен только заданный учебный идентификатор.',
      },
    ],
    criteria: {
      max: 2,
      levels: [
        {
          score: 0,
          description:
            'ODP отсутствует или не открывается либо выполнены не более трёх из шести пунктов учебного чек-листа.',
        },
        {
          score: 1,
          description:
            'ODP открывается; выполнены четыре или пять из шести пунктов учебного чек-листа.',
        },
        {
          score: 2,
          description:
            'ODP открывается; выполнены все шесть пунктов учебного чек-листа.',
        },
      ],
    },
  };
}
export const presentationTasks: readonly TaskInstance[] =
  presentationSets.map(presentationTask);
export function getPresentationSet(id: string): PresentationSet {
  const set = presentationSets.find((item) => item.id === id);
  if (!set) throw new Error('Набор презентации не найден.');
  return set;
}

export function documentTask(set: DocumentSet): TaskInstance {
  const f = set.format;
  return {
    id: `${DOCUMENT_VERSION}:${set.id}`,
    generatorId: DOCUMENT_VERSION,
    seed: set.id,
    taskNumber: 13,
    examPart: 2,
    subtype: 'document',
    variant13: 'document',
    difficulty: 2,
    topics: ['Создание текстовых документов', 'Таблицы и форматирование'],
    datasetId: `${DOCUMENT_VERSION}:files:${set.id}`,
    statement: `Оформи одностраничный документ «${set.title}» по образцу layout/sample.odt. Возьми текст и данные из source/material.odt; слова образца заменяются исходными материалами.

Страница A4, книжная ориентация, все поля 2 см. Шрифт DejaVu Serif. Заголовок: 18 пт, полужирный, ${f.titleAlign === 'center' ? 'по центру' : 'по левому краю'}, отступ после 0,5 см. Два основных абзаца: ${String(f.bodySize)} пт, ${f.bodyAlign === 'justify' ? 'по ширине' : 'по левому краю'}, первая строка ${String(f.indent).replace('.', ',')} см, межстрочный интервал ${String(f.lineHeight)}%, отступ после 0,3 см.

Создай настоящую таблицу: ${String(set.headers.length)} столбца, строк — ${String(set.rows.length + 1)} (включая заголовки). Ширины столбцов слева направо: ${f.widths.join(', ')} см. Таблица слева, отступ перед 0,3 см; все границы 0,5 пт, внутренние поля ячеек 0,15 см. Текст ячеек 12 пт. Заголовки столбцов полужирные, по центру, заливка ${f.headerColor}; остальные ячейки по левому краю. Подпись «Учебный идентификатор: ${set.id}»: 10 пт, курсив, справа, отступ перед 0,4 см. Сохрани ${set.id}.odt.

Имена, фамилии и контакты вводить не нужно. Это авторское учебное задание; критерии предназначены для самооценки и не заменяют официальную экспертную проверку.`,
    answer: {
      type: 'artifact',
      kind: 'document',
      referenceId: `${DOCUMENT_VERSION}:${set.id}:reference`,
    },
    solution: [
      {
        text: 'Открой исходный текст и образец. Настрой A4, поля и шрифт; перенеси заголовок и оба абзаца без изменения текста.',
      },
      {
        text: 'Задай параметры абзацев. Вставь таблицу нужного размера, перенеси все ячейки и настрой ширины, границы, заливку и выравнивание.',
      },
      {
        text: `Добавь подпись ${set.id}, сохрани ${set.id}.odt и открой повторно. Сравни с шестью пунктами учебного чек-листа; затем при необходимости открой эталон.`,
      },
    ],
    hints: [
      'Не имитируй таблицу пробелами или табуляцией.',
      'Задавай интервалы и отступы свойствами абзаца, а не пустыми строками.',
      'Проверь печатный вид: документ должен помещаться на одной странице.',
    ],
    commonMistakes: [
      {
        answer: 'spaces',
        explanation: 'Пробелы не заменяют таблицу с настоящими ячейками.',
      },
      {
        answer: 'pdf',
        explanation:
          'Нужен редактируемый ODT, а не только PDF или изображение.',
      },
    ],
    criteria: {
      max: 2,
      levels: [
        {
          score: 0,
          description:
            'ODT отсутствует или не открывается либо выполнены не более трёх из шести пунктов учебного чек-листа.',
        },
        {
          score: 1,
          description:
            'ODT открывается; выполнены четыре или пять из шести пунктов учебного чек-листа.',
        },
        {
          score: 2,
          description:
            'ODT открывается; выполнены все шесть пунктов учебного чек-листа.',
        },
      ],
    },
  };
}
export const documentTasks: readonly TaskInstance[] =
  documentSets.map(documentTask);
export const bankTasks: readonly TaskInstance[] = [
  ...presentationTasks,
  ...documentTasks,
];
export function getDocumentSet(id: string): DocumentSet {
  const set = documentSets.find((item) => item.id === id);
  if (!set) throw new Error('Набор документа не найден.');
  return set;
}
