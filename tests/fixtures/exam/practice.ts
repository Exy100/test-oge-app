import type { Year } from './short-answers';

interface Source {
  year: Year;
  page: number;
  criteriaPages: readonly number[];
}
export interface OfficeFixture extends Source {
  id: string;
  taskNumber: 13 | 14;
  variant13?: 'presentation' | 'document';
  topic: string;
  maxScore: 2 | 3;
  requirements: Readonly<Record<string, string | number | readonly number[]>>;
}
export const officeFixtures: readonly OfficeFixture[] = [
  {
    id: 'D2025-13.1',
    year: 2025,
    taskNumber: 13,
    variant13: 'presentation',
    page: 10,
    criteriaPages: [18, 19, 20, 21],
    topic: 'Хомяк',
    maxScore: 2,
    requirements: {
      slides: 3,
      ratio: '16:9',
      imageCounts: [0, 2, 3],
      bodyPt: 20,
      titlePt: 40,
      headingPt: 24,
      formats: 'odp,ppt,pptx',
    },
  },
  {
    id: 'D2026-13.1',
    year: 2026,
    taskNumber: 13,
    variant13: 'presentation',
    page: 10,
    criteriaPages: [18, 19, 20, 21],
    topic: 'Басéнджи',
    maxScore: 2,
    requirements: {
      slides: 3,
      ratio: '16:9',
      imageCounts: [0, 2, 3],
      bodyPt: 20,
      titlePt: 40,
      headingPt: 24,
      formats: 'odp',
    },
  },
  {
    id: 'D2027-13.1',
    year: 2027,
    taskNumber: 13,
    variant13: 'presentation',
    page: 10,
    criteriaPages: [19, 20, 21, 22],
    topic: 'Леопард',
    maxScore: 2,
    requirements: {
      slides: 3,
      ratio: '16:9',
      imageCounts: [0, 2, 3],
      bodyPt: 20,
      titlePt: 40,
      headingPt: 24,
      formats: 'odp',
    },
  },
  {
    id: 'D2025-13.2',
    year: 2025,
    taskNumber: 13,
    variant13: 'document',
    page: 12,
    criteriaPages: [22, 23, 24],
    topic: 'Атлантический океан',
    maxScore: 2,
    requirements: {
      textPt: 14,
      firstLineCm: 1,
      minLineSpacing: 1,
      maxLineSpacing: 1.5,
      alignment: 'justify',
      tableColumns: 2,
    },
  },
  {
    id: 'D2026-13.2',
    year: 2026,
    taskNumber: 13,
    variant13: 'document',
    page: 12,
    criteriaPages: [22, 23, 24],
    topic: 'Варенье из ежевики',
    maxScore: 2,
    requirements: {
      textPt: 14,
      firstLineCm: 1,
      minLineSpacing: 1,
      maxLineSpacing: 1.5,
      alignment: 'justify',
      tableColumns: 2,
    },
  },
  {
    id: 'D2027-13.2',
    year: 2027,
    taskNumber: 13,
    variant13: 'document',
    page: 12,
    criteriaPages: [23, 24, 25, 26],
    topic: 'Московско-Петроградская линия',
    maxScore: 2,
    requirements: {
      textPt: 14,
      firstLineCm: 1,
      minLineSpacing: 1,
      maxLineSpacing: 1.5,
      alignment: 'justify',
      tables: 2,
      tableColumns: 2,
    },
  },
  {
    id: 'D2025-14',
    year: 2025,
    taskNumber: 14,
    page: 13,
    criteriaPages: [25, 26],
    topic: 'Анонимное тестирование',
    maxScore: 3,
    requirements: {
      rows: 1000,
      count: 143,
      range: 49,
      chart: [143, 240, 100],
      answerCells: 'G2,G3',
      chartCell: 'G6',
    },
  },
  {
    id: 'D2026-14',
    year: 2026,
    taskNumber: 14,
    page: 13,
    criteriaPages: [27, 28],
    topic: 'Грузоперевозки',
    maxScore: 3,
    requirements: {
      rows: 370,
      distanceSum: 30584,
      meanMass: 732.3,
      meanDigits: 1,
      answerCells: 'H2,H3',
      chartCell: 'G6',
    },
  },
  {
    id: 'D2027-14',
    year: 2027,
    taskNumber: 14,
    page: 14,
    criteriaPages: [27, 28],
    topic: 'Олимпиада',
    maxScore: 3,
    requirements: {
      rows: 1000,
      count: 107,
      meanScore: 230.63,
      meanDigits: 2,
      answerCells: 'H2,H3',
      chartCell: 'G6',
    },
  },
];

export interface RobotFixture extends Source {
  id: string;
  taskNumber: 15;
  family: string;
  reference: string;
}
export const robotFixtures: readonly RobotFixture[] = [
  {
    id: 'D2025-15',
    year: 2025,
    taskNumber: 15,
    page: 14,
    criteriaPages: [28, 29, 30],
    family: 'two-intersecting-walls-with-gaps',
    reference:
      'нц пока не сверху свободно\nзакрасить\nвлево\nкц\nнц пока сверху свободно\nвлево\nкц\nнц пока слева свободно\nзакрасить\nвлево\nкц\nнц пока не слева свободно\nзакрасить\nвниз\nкц\nнц пока слева свободно\nвниз\nкц\nнц пока не слева свободно\nзакрасить\nвниз\nкц',
  },
  {
    id: 'D2026-15',
    year: 2026,
    taskNumber: 15,
    page: 14,
    criteriaPages: [29, 30, 31],
    family: 'two-walls-each-with-one-gap',
    reference:
      'нц пока не справа свободно\nзакрасить\nвверх\nкц\nнц пока справа свободно\nвверх\nкц\nнц пока сверху свободно\nзакрасить\nвверх\nкц\nнц пока не сверху свободно\nзакрасить\nвлево\nкц\nнц пока сверху свободно\nвлево\nкц\nнц пока не сверху свободно\nзакрасить\nвлево\nкц',
  },
  {
    id: 'D2027-15',
    year: 2027,
    taskNumber: 15,
    page: 15,
    criteriaPages: [29, 30, 31, 32, 33],
    family: 'stairs-up-then-down',
    reference:
      'нц пока не справа свободно\nзакрасить\nвверх\nвправо\nкц\nзакрасить\nвправо\nвниз\nнц пока не слева свободно\nзакрасить\nвправо\nвниз\nкц',
  },
];
export const publishedRobotCondition = {
  year: 2027,
  page: 15,
  source: 'D2027',
  program: 'если (справа свободно) и (не снизу свободно) то\nвправо\nвсе',
  closesIn: 'T3.17',
} as const;

export interface PythonFixture extends Source {
  id: string;
  taskNumber: 16;
  kind: 'positive-mean' | 'base7-sum' | 'octal-sentinel';
  reference: string;
  cases: readonly { input: string; output: string }[];
}
export const pythonFixtures: readonly PythonFixture[] = [
  {
    id: 'D2025-16',
    year: 2025,
    taskNumber: 16,
    page: 16,
    criteriaPages: [31, 32],
    kind: 'positive-mean',
    reference:
      'n = int(input())\ns = 0\ncnt = 0\nfor i in range(n):\n    x = int(input())\n    if x > 0:\n        s += x\n        cnt += 1\nprint(s / cnt)\nprint(cnt)\n',
    cases: [
      { input: '4\n-5\n12\n-2\n8\n', output: '10.0\n2\n' },
      { input: '1\n5\n', output: '5.0\n1\n' },
      { input: '2\n7\n10\n', output: '8.5\n2\n' },
    ],
  },
  {
    id: 'D2026-16',
    year: 2026,
    taskNumber: 16,
    page: 16,
    criteriaPages: [31, 32],
    kind: 'base7-sum',
    reference:
      'n = int(input())\ns = 0\nfor i in range(n):\n    x = int(input())\n    if x % 7 == 1:\n        s += x\nprint(s)\n',
    cases: [
      { input: '5\n15\n13\n11\n8\n23\n', output: '23\n' },
      { input: '1\n7\n', output: '0\n' },
      { input: '2\n148\n57\n', output: '205\n' },
      { input: '4\n3\n22\n12\n71\n', output: '93\n' },
    ],
  },
  {
    id: 'D2027-16',
    year: 2027,
    taskNumber: 16,
    page: 17,
    criteriaPages: [33, 34],
    kind: 'octal-sentinel',
    reference:
      'c = 0\nx = int(input())\nwhile x > 0:\n    if (x % 8 == 5) and (511 < x < 4096):\n        c += 1\n    x = int(input())\nprint(c)\n',
    cases: [
      { input: '485\n557\n893\n3029\n4125\n0\n', output: '3\n' },
      { input: '325\n541\n1075\n4229\n0\n', output: '1\n' },
      { input: '377\n565\n853\n1141\n4309\n0\n', output: '3\n' },
      { input: '535\n1555\n2775\n0\n', output: '0\n' },
    ],
  },
];
