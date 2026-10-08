import type { ArtifactKind, TaskNumber } from '../types';

interface SourceReference {
  readonly id: 'S27' | 'D27' | 'R26';
  readonly url: string;
  readonly document: string;
  readonly pages: readonly number[];
  readonly pageNumbering: 'printed' | 'pdf';
  readonly table?: number;
}
interface TaskDetails {
  readonly skill: string;
  readonly kes: readonly string[];
  readonly level: 'basic' | 'advanced' | 'high';
  readonly examPart: 1 | 2;
  readonly source: SourceReference;
}
export type ExamTaskConfig = TaskDetails &
  (
    | { readonly assessment: 'short-answer'; readonly maxScore: 1 }
    | {
        readonly assessment: 'criteria';
        readonly maxScore: 2 | 3;
        readonly artifactKinds: readonly ArtifactKind[];
      }
  );

const archiveUrl =
  'https://doc.fipi.ru/oge/demoversii-specifikacii-kodifikatory/2027/inf_9_2027.zip';
const specification = {
  id: 'S27',
  url: archiveUrl,
  document: 'ИНФ-9 ОГЭ 2027_СПЕЦ.pdf',
  pageNumbering: 'printed',
} as const;
const taskSource = { ...specification, pages: [13] } as const;
const finalTaskSource = { ...specification, pages: [14] } as const;
const shortAnswer = { assessment: 'short-answer', maxScore: 1 } as const;

/** Verified snapshot from docs/exam-format.md, not a claim of final 2027 approval. */
export const examConfig = {
  subject: 'informatics',
  format: {
    year: 2027,
    status: 'draft',
    verification: 'VERIFIED',
    finalApproval: 'UNVERIFIED',
    checkedOn: '2026-10-05',
    source: {
      ...specification,
      pages: [7, 10, 11, 13, 14],
    } satisfies SourceReference,
  },
  taskCount: 16,
  durationMinutes: 150,
  maxScore: 21,
  parts: {
    1: {
      taskNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      computerRequired: false,
    },
    2: { taskNumbers: [11, 12, 13, 14, 15, 16], computerRequired: true },
  },
  recommendedTime: {
    kind: 'recommendation',
    minutesByPart: { 1: 30, 2: 120 },
    source: {
      id: 'D27',
      url: archiveUrl,
      document: 'ИНФ-9 ОГЭ 2027_ДЕМО.pdf',
      pages: [3],
      pageNumbering: 'printed',
    } satisfies SourceReference,
  },
  tasks: {
    1: {
      skill: 'Оценивать объём памяти для текстовых данных',
      kes: ['2.2'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    2: {
      skill: 'Декодировать кодовую последовательность',
      kes: ['2.1'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    3: {
      skill: 'Определять истинность составного высказывания',
      kes: ['2.7'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    4: {
      skill: 'Анализировать простейшие модели объектов',
      kes: ['2.11'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    5: {
      skill: 'Анализировать алгоритм исполнителя с фиксированными командами',
      kes: ['3.4'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    6: {
      skill: 'Формально исполнять программу',
      kes: ['3.2'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    7: {
      skill: 'Принципы адресации в Интернете',
      kes: ['1.2'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    8: {
      skill: 'Принципы поиска информации в Интернете',
      kes: ['1.2'],
      level: 'advanced',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    9: {
      skill: 'Анализировать информацию в схемах',
      kes: ['2.11'],
      level: 'advanced',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    10: {
      skill: 'Записывать числа в системах счисления',
      kes: ['2.6'],
      level: 'basic',
      examPart: 1,
      ...shortAnswer,
      source: taskSource,
    },
    11: {
      skill: 'Искать информацию в файлах и каталогах',
      kes: ['1.1'],
      level: 'basic',
      examPart: 2,
      ...shortAnswer,
      source: taskSource,
    },
    12: {
      skill: 'Количество и объём файлов, отобранных по условию',
      kes: ['1.1'],
      level: 'basic',
      examPart: 2,
      ...shortAnswer,
      source: taskSource,
    },
    13: {
      skill: 'Создавать презентацию или текстовый документ',
      kes: ['4.3', '4.1'],
      level: 'advanced',
      examPart: 2,
      assessment: 'criteria',
      maxScore: 2,
      artifactKinds: ['presentation', 'document'],
      source: taskSource,
    },
    14: {
      skill: 'Обрабатывать большой массив данных в электронной таблице',
      kes: ['4.5'],
      level: 'high',
      examPart: 2,
      assessment: 'criteria',
      maxScore: 3,
      artifactKinds: ['spreadsheet'],
      source: taskSource,
    },
    15: {
      skill: 'Создавать и выполнять программу для исполнителя',
      kes: ['3.1'],
      level: 'high',
      examPart: 2,
      assessment: 'criteria',
      maxScore: 2,
      artifactKinds: ['robot'],
      source: finalTaskSource,
    },
    16: {
      skill: 'Создавать и выполнять программу на универсальном языке',
      kes: ['3.2'],
      level: 'high',
      examPart: 2,
      assessment: 'criteria',
      maxScore: 2,
      artifactKinds: ['program'],
      source: finalTaskSource,
    },
  } satisfies Record<TaskNumber, ExamTaskConfig>,
  task13: {
    selection: 'exactly-one',
    alternatives: [
      { number: '13.1', kind: 'presentation', kes: '4.3', answerFormat: 'odp' },
      { number: '13.2', kind: 'document', kes: '4.1', answerFormat: 'odt' },
    ],
    source: { ...specification, pages: [10, 13] } satisfies SourceReference,
  },
  grading: {
    year: 2026,
    status: 'recommendation',
    verification: 'VERIFIED',
    checkedOn: '2026-10-05',
    applicabilityToFormatYear: 'UNVERIFIED',
    regionalApplicability: 'UNVERIFIED',
    source: {
      id: 'R26',
      url: 'https://doc.fipi.ru/oge/normativno-pravovye-dokumenty/04-44_18.02.2026.pdf',
      document: 'Письмо Рособрнадзора от 18.02.2026 №04-44',
      pages: [8],
      pageNumbering: 'pdf',
      table: 11,
    } satisfies SourceReference,
    ranges: [
      { min: 0, max: 4, grade: 2 },
      { min: 5, max: 10, grade: 3 },
      { min: 11, max: 16, grade: 4 },
      { min: 17, max: 21, grade: 5 },
    ],
    notice:
      'Отметка ориентировочная, по рекомендациям 2026 года. Региональные рекомендации могут отличаться; применение шкалы к 2027 году не подтверждено.',
  },
} as const;

/** Both alternatives belong to the same numbered task, with the same maximum. */
export const practiceTaskNumbers = {
  presentation: 13,
  document: 13,
  spreadsheet: 14,
  robot: 15,
  program: 16,
} as const satisfies Record<ArtifactKind, TaskNumber>;
