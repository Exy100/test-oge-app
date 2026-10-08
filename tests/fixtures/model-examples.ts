import type {
  ArtifactKind,
  CorrectAnswer,
  DatasetManifest,
  FigureSpec,
  GradingCriteria,
  PracticeEvidence,
  TaskInstance,
  TaskNumber,
  Variant,
} from '../../src/core/types';

/** Contract examples for tests, not a published exercise bank. */
export function taskExample(taskNumber: TaskNumber = 1): TaskInstance {
  const bytes = 8;
  const bits = bytes * 8;
  const kind: ArtifactKind =
    taskNumber === 13
      ? 'presentation'
      : taskNumber === 14
        ? 'spreadsheet'
        : taskNumber === 15
          ? 'robot'
          : 'program';
  const criteria: GradingCriteria =
    taskNumber === 14
      ? {
          max: 3,
          levels: [
            { score: 0, description: 'Ни один пункт не выполнен.' },
            { score: 1, description: 'Выполнен первый пункт.' },
            { score: 2, description: 'Выполнены два пункта.' },
            { score: 3, description: 'Выполнены все пункты.' },
          ],
        }
      : {
          max: 2,
          levels: [
            { score: 0, description: 'Ни один пункт не выполнен.' },
            { score: 1, description: 'Выполнена часть работы.' },
            { score: 2, description: 'Выполнены все пункты.' },
          ],
        };
  return {
    id: `contract-${String(taskNumber)}`,
    generatorId: 'contract-example',
    seed: '',
    taskNumber,
    examPart: taskNumber <= 10 ? 1 : 2,
    subtype: 'schema-example',
    difficulty: 1,
    topics: ['Единицы информации'],
    statement: `Сколько бит в ${String(bytes)} байтах?`,
    answer:
      taskNumber <= 12
        ? { type: 'integer', value: String(bits) }
        : { type: 'artifact', kind, referenceId: 'reference-1' },
    solution: [
      { text: 'В одном байте 8 бит.' },
      { text: `Умножим ${String(bytes)} на 8.` },
      { text: `Получим ${String(bits)} бит.` },
    ],
    hints: [
      'Вспомни единицы информации.',
      'В байте восемь бит.',
      'Выполни умножение.',
    ],
    commonMistakes: [
      { answer: String(bytes), explanation: 'Нужно перевести байты в биты.' },
      {
        answer: String(bytes / 8),
        explanation: 'При переводе в биты умножают на восемь.',
      },
    ],
    ...(taskNumber >= 13 ? { criteria } : {}),
    ...(taskNumber === 13 ? { variant13: 'presentation' as const } : {}),
  };
}
export const answerExamples = [
  { type: 'integer', value: '900719925474099300000' },
  { type: 'word', value: 'ПАМЯТЬ', caseSensitive: false },
  { type: 'sequence', value: '00102', alphabet: 'digits', caseSensitive: true },
  {
    type: 'sequence',
    value: 'АБЁ',
    alphabet: 'cyrillic',
    caseSensitive: false,
  },
  { type: 'sequence', value: 'Az', alphabet: 'latin', caseSensitive: true },
  { type: 'artifact', kind: 'document', referenceId: 'document-reference' },
] satisfies CorrectAnswer[];
export const figureExamples = [
  {
    kind: 'weighted-graph',
    description: 'Два города и дорога.',
    nodes: [
      { id: 'a', label: 'А' },
      { id: 'b', label: 'Б' },
    ],
    edges: [{ from: 'a', to: 'b', weight: 3 }],
  },
  {
    kind: 'directed-graph',
    description: 'Путь из А в Б.',
    nodes: [
      { id: 'a', label: 'А' },
      { id: 'b', label: 'Б' },
    ],
    edges: [{ from: 'a', to: 'b' }],
  },
  {
    kind: 'table',
    description: 'Объём файла.',
    columns: ['Файл', 'Байты'],
    rows: [['a.txt', 8]],
  },
  {
    kind: 'logic-circuit',
    description: 'Отрицание А.',
    nodes: [
      { operation: 'input', id: 'a', label: 'А' },
      { operation: 'not', id: 'n', inputs: ['a'] },
    ],
    output: 'n',
  },
  {
    kind: 'place-value',
    description: 'Двоичная запись.',
    base: 2,
    digits: [1, 0, 1],
  },
  {
    kind: 'code-table',
    description: 'Коды букв.',
    entries: [
      { symbol: 'А', code: '0' },
      { symbol: 'Б', code: '10' },
    ],
  },
  {
    kind: 'file-tree',
    description: 'Каталог с файлом.',
    entries: [
      { kind: 'directory', path: 'texts' },
      { kind: 'file', path: 'texts/a.txt', size: 8 },
    ],
  },
  {
    kind: 'network-address',
    description: 'Адрес учебного файла.',
    protocol: 'https',
    host: 'example.org',
    path: 'texts/a.txt',
  },
  {
    kind: 'robot-field',
    description: 'Поле два на два.',
    rows: 2,
    columns: 2,
    start: { row: 0, column: 0 },
    painted: [],
    targets: [{ row: 1, column: 1 }],
    walls: [{ from: { row: 0, column: 0 }, to: { row: 0, column: 1 } }],
  },
] satisfies FigureSpec[];
export const manifestExample = {
  kind: 'generated',
  id: 'files-1',
  seed: '',
  generatorId: 'text-files',
  generatorVersion: '1',
  files: [
    {
      path: 'texts/empty.txt',
      format: 'txt',
      size: 0,
      sha256:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      license: 'CC0-1.0',
    },
  ],
} satisfies DatasetManifest;
export const evidenceExamples = [
  {
    kind: 'presentation',
    taskId: '13',
    criteriaAnswers: [],
    selfAssessment: 1,
    assessment: { source: 'self', score: 1 },
  },
  {
    kind: 'document',
    taskId: '13',
    criteriaAnswers: [{ criterionScore: 1, answer: 'Выставлены поля.' }],
  },
  {
    kind: 'spreadsheet',
    taskId: '14',
    criteriaAnswers: [],
    selfAssessment: 3,
    assessment: { source: 'self', score: 3 },
  },
  {
    kind: 'robot',
    taskId: '15',
    criteriaAnswers: [],
    code: 'закрасить',
    localRuns: [],
  },
  {
    kind: 'program',
    taskId: '16',
    criteriaAnswers: [],
    code: 'print(2 + 2)',
    localRuns: [
      {
        testId: '1',
        input: '',
        output: String(2 + 2),
        status: 'completed',
        origin: 'userLocal',
      },
    ],
    selfAssessment: 1,
    assessment: { source: 'aiAccepted', score: 2 },
  },
] satisfies PracticeEvidence[];
export function variantExample(): Variant {
  const numbers: TaskNumber[] = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  ];
  return {
    kind: 'generated',
    id: 'contract-variant',
    seed: 'variant',
    tasks: numbers.map(taskExample),
  };
}
