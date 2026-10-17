import {
  createCuratedDataset,
  type Dataset,
  type SourceFile,
} from '../datasets';
import { makeDocument } from '../datasets/odf';
import type { TaskInstance } from '../types';
import {
  getPresentationSet,
  presentationTask,
  PRESENTATION_VERSION,
} from './index';
import { illustrate } from './illustrations';
import { deckFor, layoutImage, makeSlideDeck, PAGE } from './slide-deck';
const encoder = new TextEncoder();
export async function createPresentationDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const set = getPresentationSet(task.seed);
  const expected = presentationTask(set);
  if (
    task.id !== expected.id ||
    task.datasetId !== expected.datasetId ||
    task.generatorId !== PRESENTATION_VERSION ||
    task.statement !== expected.statement ||
    task.taskNumber !== 13 ||
    task.variant13 !== 'presentation' ||
    task.answer.type !== 'artifact' ||
    task.answer.kind !== 'presentation' ||
    expected.answer.type !== 'artifact' ||
    task.answer.referenceId !== expected.answer.referenceId
  )
    throw new Error('Неизвестный набор презентации.');
  const images = new Map(
    Array.from({ length: 3 }, (_, index) => [
      `Pictures/image-${String(index + 1)}.png`,
      illustrate(set.scene, index),
    ]),
  );
  const deck = deckFor(set);
  const material = [
    set.title,
    set.summary,
    set.secondTitle,
    ...set.points,
    set.thirdTitle,
    ...set.captions,
    `Учебный идентификатор: ${set.id}`,
  ];
  const checklist = [
    'Три слайда соответствуют теме и заданным макетам; на втором два изображения, на третьем три.',
    'Название титула 40 пт; подзаголовок титула и заголовки 24 пт; остальной текст 20 пт; единый тип шрифта.',
    'Все три подписи и оба смысловых пункта переданы без потери смысла.',
    'Изображения сохраняют пропорции; текст не перекрывает изображения и читается целиком.',
    'Формат 16:9, альбомная ориентация, без анимации; объекты сохраняют взаимное расположение.',
    'Результат сохранён в ODP и открывается повторно.',
  ];
  const sources: SourceFile[] = [];
  const put = (path: string, format: SourceFile['format'], bytes: Uint8Array) =>
    sources.push({ path, format, bytes, license: 'CC0-1.0' });
  const text = (path: string, value: string) =>
    put(path, 'txt', encoder.encode(value + '\n'));
  const json = (path: string, value: unknown) =>
    put(path, 'json', encoder.encode(JSON.stringify(value, null, 2) + '\n'));
  text(
    'README.txt',
    `Авторский учебный набор №13.1: ${set.title}.\nВсе тексты, иллюстрации, макеты и эталон созданы проектом «ОГЭ по информатике», лицензия CC0-1.0.\nНачни с assignment.txt, source/material.odt и layout/guide.txt. Изображения в images — авторские схемы, не фотографии.\nСначала выполни работу, затем при необходимости открой reference/answer.odp.\nВводить имя, фамилию, контакты или другие персональные данные не нужно.\nТексты TXT/JSON — UTF-8. ODT/ODP открываются в LibreOffice.\ncriteria.json содержит учебный чек-лист; это не официальный экспертный балл. Сайт не загружает и не оценивает офисный файл ученика автоматически.`,
  );
  text('assignment.txt', task.statement);
  put('source/material.odt', 'odt', makeDocument(material));
  for (const [path, bytes] of images)
    put(path.replace('Pictures/', 'images/'), 'png', bytes);
  json('layout/slides.json', { page: PAGE, units: 'cm', slides: deck });
  text(
    'layout/guide.txt',
    `Макет трёх слайдов. Формат: 28,8 × 16,2 см (16:9).\nНа схемах: 1 — заголовок, 2 — текст или подпись, 3 — иллюстрация.\nЗелёные блоки — заголовки, синие — текст, оранжевые — изображения.\nКоординаты и размеры каждого блока даны в slides.json в сантиметрах.\nСлайд 1: название и учебный идентификатор в подзаголовке; без изображений.\nСлайд 2: заголовок; сверху изображение слева и текст справа, снизу текст слева и изображение справа.\nСлайд 3: заголовок; верхний ряд — текст, изображение, текст; нижний — изображение, текст, изображение.\nСохраняй смысл текста и структуру макета. Цвета могут отличаться от эталона, если единое оформление и читаемость сохранены.`,
  );
  deck.forEach((slide, index) =>
    put(`layout/slide-${String(index + 1)}.png`, 'png', layoutImage(slide)),
  );
  json('criteria.json', {
    kind: 'educational-self-assessment',
    max: 2,
    requiredFormat: 'odp',
    checklist,
    levels: expected.criteria?.levels,
    rule: 'Используй уровни criteria.levels; ошибки группируются по видам, а не подсчитываются как число галочек. Это самооценка, а не экспертная проверка файла.',
    sources: ['D2025-13.1', 'D2026-13.1', 'D2027-13.1'],
  });
  put('reference/answer.odp', 'odp', makeSlideDeck(deck, images));
  put('examples/score-0.odp', 'odp', makeSlideDeck(deck.slice(0, 1), images));
  put('examples/score-1.odp', 'odp', makeSlideDeck(deck.slice(0, 2), images));
  json('examples/scores.json', [
    {
      file: 'examples/score-0.odp',
      score: 0,
      reason: 'Только один титульный слайд: условия на 1 балл не выполнены.',
    },
    {
      file: 'examples/score-1.odp',
      score: 1,
      reason: 'Два слайда по теме без ошибок структуры, шрифта и изображений.',
    },
    {
      file: 'reference/answer.odp',
      score: 2,
      reason: 'Три слайда по всем требованиям.',
    },
  ]);
  json('reference/checks.json', {
    id: set.id,
    sourceParagraphs: material,
    page: PAGE,
    slides: deck.map((slide) => ({
      title: slide.title,
      text: slide.frames.flatMap((frame) =>
        frame.kind === 'text' ? frame.paragraphs : [],
      ),
      imageCount: slide.frames.filter((frame) => frame.kind === 'image').length,
    })),
  });
  if (!task.datasetId) throw new Error('Отсутствует идентификатор набора.');
  return createCuratedDataset(
    task.datasetId,
    set.id,
    'Проект «ОГЭ по информатике»',
    sources,
    PRESENTATION_VERSION,
  );
}
