import { presentationCriteria, documentCriteria } from '../office/rubrics.ts';
import { documentSets, type DocumentSet } from './document-content.ts';
export { documentSets } from './document-content.ts';
export const DOCUMENT_VERSION = 'curated-documents-v2';
import type { TaskInstance } from '../types.ts';
import {
  presentationSets,
  type PresentationSet,
} from './presentation-content.ts';
export { presentationSets } from './presentation-content.ts';
export const PRESENTATION_VERSION = 'curated-presentations-v2';
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
    statement: `Создай презентацию «${set.title}» из трёх слайдов по макету набора. Используй исходный ODT и авторские иллюстрации. Формат 16:9, альбомная ориентация, без анимации. Единый тип шрифта: название на титуле 40 пт; его подзаголовок и заголовки остальных слайдов 24 пт; основной текст 20 пт.\n\nПервый слайд: название и учебный идентификатор ${set.id} в подзаголовке. Второй: «${set.secondTitle}», два изображения и два текстовых блока. Третий: «${set.thirdTitle}», три изображения и три текстовых блока. Взаимное расположение объектов сохрани по макетам. Сохраняй пропорции изображений; текст и изображения должны помещаться на слайде. Используй единое оформление. Сохрани результат как ${set.id}.odp.\n\nИмена, фамилии и контакты вводить не нужно. Это авторское учебное задание; критерии в наборе предназначены для самооценки и не заменяют официальную экспертную проверку.`,
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
        text: `Сохрани ${set.id}.odp, открой файл повторно и сравни с требованиями к структуре, шрифту и изображениям. Проверь отсутствие обрезанного текста и искажённых изображений; затем при необходимости открой эталон.`,
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
    criteria: presentationCriteria,
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
    difficulty: set.family === 'sections' ? 3 : 2,
    topics: ['Создание текстовых документов', 'Таблицы и форматирование'],
    datasetId: `${DOCUMENT_VERSION}:files:${set.id}`,
    statement: `Оформи документ «${set.title}» по визуальному образцу layout/sample.pdf. Текст и данные для набора находятся в source/material.odt. Повтори взаимное расположение текста и таблицы, объединение ячеек и выделения полужирным, курсивом и подчёркиванием.

A4, книжная ориентация, поля 2 см. Единый шрифт DejaVu Serif, весь текст 14 пт. Заголовок прописными буквами, по центру. Основной текст по ширине; первая строка 1 см, межстрочный интервал ${String(f.lineHeight)}%, интервалы между заголовком, абзацами и таблицей 14 пт. Отступы и интервалы задавай свойствами абзаца; разбиение на строки автоматическое.

Таблица: два столбца шириной ${f.widths.join(' и ')} см, по центру страницы, уже основного текста; все ячейки по вертикали по центру. ${set.family === 'sections' ? 'Первый столбец по центру, второй по левому краю; строки заголовков разделов объединены и выровнены по центру.' : 'Первый столбец по левому краю, второй по центру; строка заголовков по центру.'} Сохрани границы, выделения и все данные образца. Не используй пустые абзацы, пробелы вместо отступов или разрывы строк. Сохрани ${set.id}.odt.

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
        text: 'Задай параметры абзацев и выделения по образцу. Вставь таблицу, объедини нужные ячейки и настрой ширины, границы и выравнивание.',
      },
      {
        text: `Сохрани ${set.id}.odt и открой повторно. Сравни две группы требований — основной текст и таблицу; затем при необходимости открой эталон.`,
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
    criteria: documentCriteria,
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
