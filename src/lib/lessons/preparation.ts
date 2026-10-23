import { lessonRoute } from './catalog';

interface PreparationDefinition {
  id: string;
  section: string;
  taskNumber: number;
  title: string;
  variant13?: 'presentation' | 'document';
}

/** Course links released together with the corresponding lessons (ADR-043). */
const definitions: PreparationDefinition[] = [
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
  {
    id: 'logic-operations',
    section: 'i3',
    taskNumber: 3,
    title: 'Высказывания и операции И, ИЛИ, НЕ',
  },
  {
    id: 'logic-negation',
    section: 'i3',
    taskNumber: 3,
    title: 'Скобки и отрицание составного условия',
  },
  {
    id: 'natural-solutions',
    section: 'i3',
    taskNumber: 3,
    title: 'Находим натуральные решения логического условия',
  },
  {
    id: 'graph-models',
    section: 'i4',
    taskNumber: 4,
    title: 'Читаем графы, таблицы дорог и стрелки',
  },
  {
    id: 'shortest-route',
    section: 'i4',
    taskNumber: 4,
    title: 'Ищем кратчайший путь по таблице дорог',
  },
  {
    id: 'directed-paths',
    section: 'i4',
    taskNumber: 9,
    title: 'Считаем пути в направленной схеме',
  },
  {
    id: 'executor-commands',
    section: 'i5',
    taskNumber: 5,
    title: 'Команды исполнителя и промежуточные значения',
  },
  {
    id: 'executor-algorithm',
    section: 'i5',
    taskNumber: 5,
    title: 'Составляем программу до пяти команд',
  },
  {
    id: 'executor-reverse',
    section: 'i5',
    taskNumber: 5,
    title: 'Обратный ход: от цели к началу',
  },
  {
    id: 'executor-check',
    section: 'i5',
    taskNumber: 5,
    title: 'Проверяем программу и формат ответа',
  },
  {
    id: 'program-variables',
    section: 'i6',
    taskNumber: 6,
    title: 'Переменные и последовательные присваивания',
  },
  {
    id: 'program-conditions',
    section: 'i6',
    taskNumber: 6,
    title: 'Условия и параметр по девяти запускам',
  },
  {
    id: 'program-loops',
    section: 'i6',
    taskNumber: 6,
    title: 'Циклы for и while: читаем шаг за шагом',
  },
  {
    id: 'program-tracing',
    section: 'i6',
    taskNumber: 6,
    title: 'Таблица трассировки и проверка параметра',
  },
  {
    id: 'network-resources',
    section: 'i7',
    taskNumber: 7,
    title: 'Ресурс в сети: протокол, сервер и файл',
  },
  {
    id: 'url-parts',
    section: 'i7',
    taskNumber: 7,
    title: 'Части URL: точки, двоеточие и слеши',
  },
  {
    id: 'restore-address',
    section: 'i7',
    taskNumber: 7,
    title: 'Восстанавливаем URL из семи фрагментов',
  },
  {
    id: 'search-operations',
    section: 'i8',
    taskNumber: 8,
    title: 'Поисковые запросы: И, ИЛИ и НЕ',
  },
  {
    id: 'venn-diagrams',
    section: 'i8',
    taskNumber: 8,
    title: 'Диаграммы множеств и непересекающиеся области',
  },
  {
    id: 'count-search-results',
    section: 'i8',
    taskNumber: 8,
    title: 'Считаем результаты условного поискового запроса',
  },
  {
    id: 'positional-notation',
    section: 'i9',
    taskNumber: 10,
    title: 'Позиционная запись: цифра, разряд и основание',
  },
  {
    id: 'base-conversion',
    section: 'i9',
    taskNumber: 10,
    title: 'Перевод чисел: веса разрядов и остатки',
  },
  {
    id: 'compare-numerals',
    section: 'i9',
    taskNumber: 10,
    title: 'Сравниваем числа и анализируем разряды',
  },
  {
    id: 'directories',
    section: 'i10',
    taskNumber: 11,
    title: 'Каталоги и полные пути: где искать файл',
  },
  {
    id: 'search-file-text',
    section: 'i10',
    taskNumber: 11,
    title: 'Поиск в файлах: автор, герой и контекст',
  },
  {
    id: 'file-masks-size',
    section: 'i10',
    taskNumber: 12,
    title: 'Отбор файлов: расширения, маски и объём',
  },
  {
    id: 'document-paragraphs',
    section: 'i11',
    taskNumber: 13,
    title: 'Документ: шрифт, абзацы и сохранение',
    variant13: 'document',
  },
  {
    id: 'document-tables',
    section: 'i11',
    taskNumber: 13,
    title: 'Таблица в документе: ячейки и объединения',
    variant13: 'document',
  },
  {
    id: 'presentation-layout',
    section: 'i11',
    taskNumber: 13,
    title: 'Презентация: макет, изображения и читаемость',
    variant13: 'presentation',
  },
  {
    id: 'sheet-references',
    section: 'i12',
    taskNumber: 14,
    title: 'Ячейки, диапазоны и копирование формул',
  },
  {
    id: 'sheet-selection',
    section: 'i12',
    taskNumber: 14,
    title: 'Отбор, количество, сумма и среднее',
  },
  {
    id: 'sheet-charts',
    section: 'i12',
    taskNumber: 14,
    title: 'Круговая диаграмма: данные, легенда и значения',
  },
];
export const preparationLessons = definitions.map((lesson) => ({
  ...lesson,
  route: lessonRoute(lesson),
}));
export function preparationFor(
  taskNumber: number,
  variant13: 'presentation' | 'document',
) {
  return preparationLessons.filter(
    (lesson) =>
      lesson.taskNumber === taskNumber &&
      (!lesson.variant13 || lesson.variant13 === variant13),
  );
}
