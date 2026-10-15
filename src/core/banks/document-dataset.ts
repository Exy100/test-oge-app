import {
  createCuratedDataset,
  type Dataset,
  type SourceFile,
} from '../datasets';
import { makeDocument } from '../datasets/odf';
import type { TaskInstance } from '../types';
import { DOCUMENT_VERSION, documentTask, getDocumentSet } from './index';
import {
  documentMaterial,
  makeTextDocument,
  sampleDocumentSet,
} from './text-document';
const encoder = new TextEncoder();
export async function createDocumentDataset(
  task: TaskInstance,
): Promise<Dataset> {
  const set = getDocumentSet(task.seed);
  const expected = documentTask(set);
  if (
    task.id !== expected.id ||
    task.datasetId !== expected.datasetId ||
    task.generatorId !== DOCUMENT_VERSION ||
    task.statement !== expected.statement ||
    task.taskNumber !== 13 ||
    task.variant13 !== 'document' ||
    task.answer.type !== 'artifact' ||
    task.answer.kind !== 'document' ||
    expected.answer.type !== 'artifact' ||
    task.answer.referenceId !== expected.answer.referenceId
  )
    throw new Error('Неизвестный набор документа.');
  const sources: SourceFile[] = [];
  const put = (path: string, format: SourceFile['format'], bytes: Uint8Array) =>
    sources.push({ path, format, bytes, license: 'CC0-1.0' });
  const text = (path: string, value: string) =>
    put(path, 'txt', encoder.encode(value + '\n'));
  const json = (path: string, value: unknown) =>
    put(path, 'json', encoder.encode(JSON.stringify(value, null, 2) + '\n'));
  const material = documentMaterial(set);
  const sample = sampleDocumentSet(set);
  text(
    'README.txt',
    `Авторский учебный набор №13.2: ${set.title}. Все тексты, образец и эталон созданы проектом «ОГЭ по информатике», CC0-1.0.
Начни с assignment.txt, source/material.odt и layout/sample.odt. Образец показывает оформление на другом тексте; данные для работы бери только из source.
После самостоятельного выполнения открой reference/answer.odt. Офисные файлы редактируются в LibreOffice Writer; TXT/JSON — UTF-8. Шрифт DejaVu Serif распространяется отдельно в составе свободного пакета DejaVu.
Персональные данные вводить не нужно. criteria.json — учебная самооценка, а не официальный экспертный балл. Сайт не загружает и не оценивает офисный файл автоматически.`,
  );
  text('assignment.txt', task.statement);
  text('source/material.txt', material.join('\n'));
  put('source/material.odt', 'odt', makeDocument(material));
  put('layout/sample.odt', 'odt', makeTextDocument(sample));
  json('layout/format.json', {
    page: { width: 21, height: 29.7, margin: 2, units: 'cm' },
    font: 'DejaVu Serif',
    ...set.format,
  });
  json('criteria.json', {
    kind: 'educational-self-assessment',
    max: 2,
    checklist: [
      'Точно перенесены заголовок, оба абзаца и учебный идентификатор; текст образца заменён.',
      'A4, книжная ориентация, поля 2 см; всё помещается на одной странице.',
      'Шрифт, размер, начертание и выравнивание заголовка соответствуют заданию.',
      'Оба основных абзаца имеют заданные размер, выравнивание, первую строку и интервалы.',
      'Создана настоящая таблица нужного размера со всеми исходными данными в правильном порядке.',
      'Ширины, границы, поля и оформление ячеек, а также курсивная подпись соответствуют заданию.',
    ],
    levels: task.criteria?.levels,
  });
  put('reference/answer.odt', 'odt', makeTextDocument(set));
  json('reference/checks.json', {
    id: set.id,
    sourceParagraphs: material,
    reference: set,
    sample,
  });
  return createCuratedDataset(
    task.datasetId ?? '',
    set.id,
    'Проект «ОГЭ по информатике»: авторские учебные материалы',
    sources,
    DOCUMENT_VERSION,
  );
}
