import type { TaskNumber } from '../../../src/core/types';
import { shortFixtures } from './short-answers';
import { officeFixtures, robotFixtures } from './practice';

export interface FormatRow {
  id: string;
  taskNumber: TaskNumber;
  format: string;
  fixtureIds: string[];
  generatorIds: string[];
  integration: 'covered' | 'partial' | 'deferred';
  owner: 'T3.14' | 'T3.15' | 'T3.16' | 'T3.17' | 'T3.12';
  gap: string;
}
const ids = (number: TaskNumber) =>
  shortFixtures.filter((f) => f.taskNumber === number).map((f) => f.id);
export const formatRows: FormatRow[] = [
  {
    id: 'M01',
    taskNumber: 1,
    format: 'Удаление слова и разделителя из списка, фиксированная кодировка',
    fixtureIds: ids(1),
    generatorIds: ['removed-word-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M02a',
    taskNumber: 2,
    format:
      'Декодирование неразделённой последовательности; не обязательно код Фано',
    fixtureIds: ids(2).filter((id) => id !== 'D2025-02'),
    generatorIds: ['decode-prefix-v2', 'decode-nonprefix-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M02b',
    taskNumber: 2,
    format:
      'Определение повторяющихся букв; несколько допустимых порядков ответа',
    fixtureIds: ['D2025-02'],
    generatorIds: ['decode-repeated-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M03',
    taskNumber: 3,
    format: 'Логическое выражение: число решений или граница при ложности',
    fixtureIds: ids(3),
    generatorIds: ['logic-count-true-v2', 'logic-min-false-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M04',
    taskNumber: 4,
    format: 'Кратчайший простой путь по таблице взвешенного графа',
    fixtureIds: ids(4),
    generatorIds: ['shortest-road-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M05',
    taskNumber: 5,
    format:
      'Любая программа не длиннее лимита; в том числе возведение в квадрат',
    fixtureIds: ids(5),
    generatorIds: ['executor-multiply-v2', 'executor-square-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M06',
    taskNumber: 6,
    format: 'Выбор параметра A по количеству YES/NO на девяти запусках',
    fixtureIds: ids(6),
    generatorIds: ['parameter-min-v2', 'parameter-max-v2', 'parameter-any-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M07',
    taskNumber: 7,
    format: 'Сборка URL, фрагменты обозначены цифрами 1–7',
    fixtureIds: ids(7),
    generatorIds: ['url-fragments-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M08',
    taskNumber: 8,
    format: 'Поисковые множества: A & (B | C), найти пересечение или A & C',
    fixtureIds: ids(8),
    generatorIds: [
      'search-conditional-triple-v2',
      'search-conditional-pair-v2',
    ],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M09',
    taskNumber: 9,
    format: 'Число направленных путей по рисунку графа',
    fixtureIds: ids(9),
    generatorIds: ['paths-diagram-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M10',
    taskNumber: 10,
    format:
      'Арифметическое выражение из двоичного, восьмеричного, шестнадцатеричного чисел',
    fixtureIds: ids(10),
    generatorIds: ['numeral-sum-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M11',
    taskNumber: 11,
    format: 'Контекстный поиск в произведении по автору и признакам персонажа',
    fixtureIds: ids(11),
    generatorIds: ['context-reading-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M12',
    taskNumber: 12,
    format: 'Количество файлов по расширениям в нескольких подкаталогах',
    fixtureIds: ids(12),
    generatorIds: ['file-extensions-v2'],
    integration: 'covered',
    owner: 'T3.15',
    gap: '',
  },
  {
    id: 'M13p',
    taskNumber: 13,
    format: 'Презентация: три слайда, на втором 2 изображения, на третьем 3',
    fixtureIds: officeFixtures
      .filter((f) => f.variant13 === 'presentation')
      .map((f) => f.id),
    generatorIds: ['curated-presentations-v2'],
    integration: 'covered',
    owner: 'T3.16',
    gap: '',
  },
  {
    id: 'M13d',
    taskNumber: 13,
    format:
      'Воспроизведение образца документа: абзацы, таблицы и форматирование',
    fixtureIds: officeFixtures
      .filter((f) => f.variant13 === 'document')
      .map((f) => f.id),
    generatorIds: ['curated-documents-v2'],
    integration: 'covered',
    owner: 'T3.16',
    gap: '',
  },
  {
    id: 'M14',
    taskNumber: 14,
    format:
      'Два вычисления по таблице и круговая диаграмма с легендой/значениями',
    fixtureIds: officeFixtures
      .filter((f) => f.taskNumber === 14)
      .map((f) => f.id),
    generatorIds: [
      'sheet-count-range-v2',
      'sheet-sum-mean-v2',
      'sheet-count-mean-v2',
    ],
    integration: 'covered',
    owner: 'T3.16',
    gap: '',
  },
  {
    id: 'M15',
    taskNumber: 15,
    format:
      'Обобщённый алгоритм: стены с проходами или лестница, составные условия',
    fixtureIds: robotFixtures.map((f) => f.id),
    generatorIds: [
      'robot-corner-right-v2',
      'robot-corner-left-v2',
      'robot-stairs-v2',
    ],
    integration: 'covered',
    owner: 'T3.17',
    gap: '',
  },
  {
    id: 'M16a',
    taskNumber: 16,
    format: 'Среднее положительных и их количество, дробный вывод',
    fixtureIds: ['D2025-16'],
    generatorIds: [],
    integration: 'deferred',
    owner: 'T3.12',
    gap: 'Нужен дробный результат; текущий локальный checker принимает только целые. Повторная задача №16 требует планирования (Q-I8).',
  },
  {
    id: 'M16b',
    taskNumber: 16,
    format: 'Сумма значений с заданным остатком в системе счисления',
    fixtureIds: ['D2026-16'],
    generatorIds: ['python-filter-v1'],
    integration: 'partial',
    owner: 'T3.12',
    gap: 'Фильтр кратности и пара count/sum не покрывают остаток 1 и единственный sum. Q-I8.',
  },
  {
    id: 'M16c',
    taskNumber: 16,
    format: 'Ввод до нуля, число значений с длиной записи и последней цифрой',
    fixtureIds: ['D2027-16'],
    generatorIds: ['python-digits-v1'],
    integration: 'deferred',
    owner: 'T3.12',
    gap: 'Текущий подтип обрабатывает цифры одного числа, а не последовательность до нуля. Q-I8.',
  },
];

/** These are not disabled tests: product integrations get enabled in their owner task. */
export const pendingProductIntegrations = formatRows.filter(
  (row) => row.integration !== 'covered',
);
