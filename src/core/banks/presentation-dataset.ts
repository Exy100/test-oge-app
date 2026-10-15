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
    `Созданы ровно три слайда с заданными заголовками, на титуле указан только идентификатор ${set.id}.`,
    'На втором слайде переданы оба смысловых пункта исходного текста.',
    'На третьем слайде размещены обе подписи с сохранением смысла.',
    'Все требуемые иллюстрации размещены на своих слайдах и сохраняют пропорции.',
    'Использованы формат 16:9, единые цвета и шрифты; заголовки 30–32 пт, основной текст не меньше 20 пт.',
    'Текст читается целиком, объекты не перекрывают друг друга и не выходят за границы слайдов.',
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
    `Макет трёх слайдов. Формат: 28,8 × 16,2 см (16:9).\nНа схемах: 1 — заголовок, 2 — текст или подпись, 3 — иллюстрация.\nЗелёные блоки — заголовки, синие — текст, оранжевые — изображения.\nКоординаты и размеры каждого блока даны в slides.json в сантиметрах.\nСлайд 1: название, подзаголовок, иллюстрация и учебный идентификатор.\nСлайд 2: заголовок, два смысловых пункта, иллюстрация и подпись.\nСлайд 3: заголовок, две иллюстрации и две подписи.\nСохраняй смысл текста и структуру макета. Цвета могут отличаться от эталона, если единое оформление и читаемость сохранены.`,
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
    rule: 'Открываемый ODP: все 6 пунктов — 2; 4–5 — 1; 0–3 — 0. Если ODP отсутствует или не открывается — 0. Не является официальной оценкой.',
  });
  put('reference/answer.odp', 'odp', makeSlideDeck(deck, images));
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
  );
}
