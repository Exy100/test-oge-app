import { lessonRoute } from './catalog';

/** Course links released together with the corresponding lessons (ADR-043). */
export const preparationLessons = [
  {
    id: 'bits-bytes',
    section: 'i1',
    taskNumber: 1,
    title: 'Биты и байты: измеряем информацию',
  },
  {
    id: 'text-encoding',
    section: 'i1',
    taskNumber: 1,
    title: 'Кодировка и объём текста',
  },
  {
    id: 'changing-text',
    section: 'i1',
    taskNumber: 1,
    title: 'Удаляем и добавляем символы',
  },
  {
    id: 'code-tables',
    section: 'i2',
    taskNumber: 2,
    title: 'Таблица кодов и равномерное кодирование',
  },
  {
    id: 'decoding',
    section: 'i2',
    taskNumber: 2,
    title: 'Декодирование: проверяем весь сигнал',
  },
  {
    id: 'unique-decoding',
    section: 'i2',
    taskNumber: 2,
    title: 'Однозначность и непрефиксные таблицы',
  },
].map((lesson) => ({ ...lesson, route: lessonRoute(lesson) }));
