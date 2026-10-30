import { z } from '../zod';
import { TaskNumberSchema, unique } from '../schemas/shared';
import { reviewSchema } from '../stream/schemas';

export const PREFIX = 'oge:informatics:v1:';
export const MAX_BACKUP_BYTES = 2_000_000;
const version = z.literal(1);
const id = z.string().min(1).max(200);
const count = z.number().int().min(0).max(1_000_000);
const practiceTally = z
  .strictObject({
    attempts: count,
    credit: z.number().min(0).max(1_000_000),
  })
  .refine((row) => row.credit <= row.attempts);
const timestamp = z.iso.datetime();
const answers = z
  .array(
    z.strictObject({
      taskNumber: TaskNumberSchema,
      text: z.string().max(20000),
      reasoning: z.string().max(1500),
      checked: z.boolean().optional(),
    }),
  )
  .max(16)
  .refine((rows) => unique(rows.map((row) => row.taskNumber)));
const assessment = z
  .strictObject({
    taskNumber: z.union([
      z.literal(13),
      z.literal(14),
      z.literal(15),
      z.literal(16),
    ]),
    score: z.number().int().min(0).max(3),
    source: z.enum(['self', 'aiAccepted']),
  })
  .refine((row) => row.score <= (row.taskNumber === 14 ? 3 : 2));
const attempt = z.strictObject({
  id,
  variantId: z.string().min(1).max(240),
  seed: z.string().max(200),
  variant13: z.enum(['presentation', 'document']),
  pythonFormatVersion: z.literal(1).optional(),
  mode: z.enum(['exam', 'training']),
  currentTask: TaskNumberSchema.optional(),
  startedAt: timestamp,
  elapsedMs: z.number().int().min(0).max(86_400_000),
  answers,
  assessments: z
    .array(assessment)
    .max(4)
    .refine((rows) => unique(rows.map((row) => row.taskNumber))),
  marked: z.array(TaskNumberSchema).max(16).refine(unique),
});
export const settingsSchema = z.strictObject({
  version,
  theme: z.enum(['system', 'light', 'dark']),
  fontSize: z.union([
    z.literal(100),
    z.literal(125),
    z.literal(150),
    z.literal(200),
  ]),
  animations: z.boolean(),
});
export const areaSchemas = {
  settings: settingsSchema,
  streamStats: z.strictObject({
    version,
    completed: count.default(0),
    streak: count.default(0),
    entries: z
      .array(
        z
          .strictObject({
            taskNumber: TaskNumberSchema,
            attempts: count,
            correct: count,
            self: practiceTally.default({ attempts: 0, credit: 0 }),
            aiAccepted: practiceTally.default({ attempts: 0, credit: 0 }),
            lastActivity: timestamp,
          })
          .refine((row) => row.correct <= row.attempts)
          .refine(
            (row) =>
              row.taskNumber > 12 ||
              (row.self.attempts === 0 && row.aiAccepted.attempts === 0),
          ),
      )
      .max(16)
      .refine((rows) => unique(rows.map((row) => row.taskNumber))),
  }),
  reviewQueue: z.strictObject({
    version,
    entries: z
      .array(reviewSchema)
      .max(1000)
      .refine((rows) =>
        unique(
          rows.map((row) =>
            JSON.stringify([row.generatorId, row.seed, row.taskNumber]),
          ),
        ),
      ),
  }),
  variantAttempts: z.strictObject({
    version,
    entries: z
      .array(
        attempt
          .extend({
            finishedAt: timestamp,
            score: z.number().int().min(0).max(21).nullable(),
          })
          .refine(
            (row) => Date.parse(row.finishedAt) >= Date.parse(row.startedAt),
          ),
      )
      .max(100)
      .refine((rows) => unique(rows.map((row) => row.id))),
  }),
  variantDraft: z.strictObject({ version, current: attempt.nullable() }),
  lessonProgress: z.strictObject({
    version,
    entries: z
      .array(
        z
          .strictObject({
            lessonId: id,
            completed: z.boolean(),
            quizCorrect: count,
            quizTotal: count,
            levels: z.array(id).max(100).refine(unique),
          })
          .refine((row) => row.quizCorrect <= row.quizTotal),
      )
      .max(500)
      .refine((rows) => unique(rows.map((row) => row.lessonId))),
  }),
  aiConsent: z.strictObject({
    version,
    enabled: z.boolean(),
    policy: z.literal('openrouter-feedback-v1').optional(),
  }),
};
export const areasSchema = z
  .strictObject(areaSchemas)
  .refine(
    (data) =>
      new TextEncoder().encode(JSON.stringify(data)).length <= 1_300_000,
    'Слишком много сохранённых учебных данных.',
  );
export type Areas = z.infer<typeof areasSchema>;
export type Area = keyof Areas;
export const areaNames = Object.keys(areaSchemas) as Area[];
export const areaLabels: Record<Area, string> = {
  settings: 'настройки',
  streamStats: 'статистика тренировок',
  reviewQueue: 'повторение ошибок',
  variantAttempts: 'история вариантов',
  variantDraft: 'текущий вариант',
  lessonProgress: 'прогресс уроков',
  aiConsent: 'предпочтение разбора с ИИ',
};
export function defaults(): Areas {
  return {
    settings: { version: 1, theme: 'system', fontSize: 100, animations: true },
    streamStats: { version: 1, completed: 0, streak: 0, entries: [] },
    reviewQueue: { version: 1, entries: [] },
    variantAttempts: { version: 1, entries: [] },
    variantDraft: { version: 1, current: null },
    lessonProgress: { version: 1, entries: [] },
    aiConsent: { version: 1, enabled: false },
  };
}
export const cacheSchema = z.strictObject({
  version,
  entries: z
    .array(
      z.strictObject({
        mode: id,
        taskId: id,
        answerHash: z.string().regex(/^[a-f0-9]{64}$/u),
        response: z.string().max(20000),
      }),
    )
    .max(30)
    .refine((rows) =>
      unique(
        rows.map((row) =>
          JSON.stringify([row.mode, row.taskId, row.answerHash]),
        ),
      ),
    ),
});
export const boundedCacheSchema = cacheSchema.refine(
  (data) => new TextEncoder().encode(JSON.stringify(data)).length <= 500_000,
  'Кэш превышает 500 КБ.',
);
export type CacheData = z.infer<typeof cacheSchema>;
export const backupSchema = z.strictObject({
  format: z.literal('oge-informatics'),
  version,
  areas: areasSchema,
  aiCache: boundedCacheSchema,
});
export type Backup = z.infer<typeof backupSchema>;
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error('Файл слишком большой. Максимум — 2 МБ.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'Не удалось прочитать JSON. Выбери файл экспорта этого сайта.',
    );
  }
  const result = backupSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      'Файл содержит неверные данные или неподдерживаемую версию. Настройки не изменены.',
    );
  return result.data;
}

// Version 0 is the minimal settings object supported by this migration.
const settingsV0 = z.strictObject({
  version: z.literal(0),
  theme: z.enum(['system', 'light', 'dark']),
});
export function parseArea<K extends Area>(area: K, value: unknown): Areas[K] {
  if (area === 'settings') {
    const old = settingsV0.safeParse(value);
    if (old.success) value = { ...defaults().settings, theme: old.data.theme };
  }
  return areaSchemas[area].parse(value) as Areas[K];
}
