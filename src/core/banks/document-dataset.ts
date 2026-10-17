import {
  createCuratedDataset,
  type Dataset,
  type SourceFile,
} from '../datasets';
import { makeDocument } from '../datasets/odf';
import { documentPdf } from './document-pdf';
import type { TaskInstance } from '../types';
import { DOCUMENT_VERSION, documentTask, getDocumentSet } from './index';
import { documentMaterial, makeTextDocument } from './text-document';
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
  text(
    'README.txt',
    `Авторский учебный набор №13.2: ${set.title}. Все тексты, образец и эталон созданы проектом «ОГЭ по информатике», CC0-1.0.
Начни с assignment.txt, source/material.odt и layout/sample.pdf. Повтори видимый образец в текстовом редакторе; исходный текст для набора находится в source.
После самостоятельного выполнения открой reference/answer.odt. Офисные файлы редактируются в LibreOffice Writer; TXT/JSON — UTF-8. Шрифт DejaVu Serif распространяется отдельно в составе свободного пакета DejaVu.
Персональные данные вводить не нужно. criteria.json — учебная самооценка, а не официальный экспертный балл. Сайт не загружает и не оценивает офисный файл автоматически.`,
  );
  text('assignment.txt', task.statement);
  text('source/material.txt', material.join('\n'));
  put('source/material.odt', 'odt', makeDocument(material));
  put('layout/sample.pdf', 'pdf', documentPdf(set.id));
  json('layout/format.json', {
    page: { width: 21, height: 29.7, margin: 2, units: 'cm' },
    font: 'DejaVu Serif',
    ...set.format,
  });
  json('criteria.json', {
    kind: 'educational-self-assessment',
    max: 2,
    checklist: [
      'Основной текст: 14 пт, заголовок прописными буквами; все выделения по образцу.',
      'Основной текст: интервалы 14 пт без пустых абзацев, межстрочный 1–1,5, заголовок по центру, абзацы по ширине, первая строка 1 см без пробелов, автоматические переносы строк.',
      'Основной текст: не более пяти текстовых ошибок.',
      'Таблица: нужные строки, столбцы и объединения; правильные выделения и выравнивание.',
      'Таблица по центру и уже текста, ячейки по вертикали по центру.',
      'Таблица: не более трёх текстовых ошибок.',
    ],
    sources: ['D2025-13.2', 'D2026-13.2', 'D2027-13.2'],
    rule: 'Применяй группы требований и уровни оценки, а не число отмеченных пунктов.',
    levels: task.criteria?.levels,
  });
  put('reference/answer.odt', 'odt', makeTextDocument(set));
  put('examples/score-0.odt', 'odt', makeTextDocument(set, 'title-only'));
  put('examples/score-1.odt', 'odt', makeTextDocument(set, 'text-only'));
  json('examples/scores.json', [
    {
      file: 'examples/score-0.odt',
      score: 0,
      reason: 'Основной текст не набран, таблица отсутствует.',
    },
    {
      file: 'examples/score-1.odt',
      score: 1,
      reason: 'Основной текст полностью верен, таблица отсутствует.',
    },
    {
      file: 'reference/answer.odt',
      score: 2,
      reason: 'Основной текст и таблица выполнены верно.',
    },
  ]);
  json('reference/checks.json', {
    id: set.id,
    sourceParagraphs: material,
    reference: set,
  });
  return createCuratedDataset(
    task.datasetId ?? '',
    set.id,
    'Проект «ОГЭ по информатике»: авторские учебные материалы',
    sources,
    DOCUMENT_VERSION,
  );
}
