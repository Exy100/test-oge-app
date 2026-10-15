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
export const bankTasks: readonly TaskInstance[] =
  presentationSets.map(presentationTask);
export function getPresentationSet(id: string): PresentationSet {
  const set = presentationSets.find((item) => item.id === id);
  if (!set) throw new Error('Набор презентации не найден.');
  return set;
}
