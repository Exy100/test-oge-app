import { z } from '../zod';
import { examConfig } from '../exam/exam.config';
import { FigureSpecSchema } from './figure';
import {
  AnswerTypeSchema,
  ArtifactKindSchema,
  ScoreSchema,
  TaskNumberSchema,
  TextSchema,
  unique,
} from './shared';

const canonicalInteger = /^(?:0|-?[1-9][0-9]*)$/u;
const IntegerValueSchema = z.string().regex(canonicalInteger);
export const CorrectAnswerSchema = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal(AnswerTypeSchema.enum.integer),
      value: IntegerValueSchema,
      acceptedRange: z
        .strictObject({
          min: IntegerValueSchema.optional(),
          max: IntegerValueSchema.optional(),
        })
        .optional(),
    })
    .refine(
      (answer) =>
        !answer.acceptedRange ||
        ((answer.acceptedRange.min !== undefined ||
          answer.acceptedRange.max !== undefined) &&
          [
            answer.value,
            answer.acceptedRange.min,
            answer.acceptedRange.max,
          ].every(
            (value) => value === undefined || canonicalInteger.test(value),
          ) &&
          (answer.acceptedRange.min === undefined ||
            BigInt(answer.acceptedRange.min) <= BigInt(answer.value)) &&
          (answer.acceptedRange.max === undefined ||
            BigInt(answer.value) <= BigInt(answer.acceptedRange.max))),
      {
        message: 'Эталон должен входить в допустимый целочисленный диапазон.',
        path: ['acceptedRange'],
      },
    ),
  z.strictObject({
    type: z.literal('word'),
    value: TextSchema,
    caseSensitive: z.boolean(),
  }),
  z
    .strictObject({
      type: z.literal('sequence'),
      value: TextSchema,
      alphabet: z.enum(['digits', 'latin', 'cyrillic']),
      caseSensitive: z.boolean(),
      alternatives: z.array(TextSchema).min(1).max(63).optional(),
    })
    .refine(
      (answer) => {
        const alphabet = {
          digits: /^[0-9]+$/u,
          latin: /^[A-Za-z]+$/u,
          cyrillic: /^[А-Яа-яЁё]+$/u,
        };
        const values = [answer.value, ...(answer.alternatives ?? [])];
        return (
          values.every((value) => alphabet[answer.alphabet].test(value)) &&
          unique(
            values.map((value) =>
              answer.caseSensitive
                ? value
                : value.toLowerCase().normalize('NFC'),
            ),
          )
        );
      },
      {
        message:
          'Эталоны последовательности должны быть различными и соответствовать алфавиту.',
        path: ['value'],
      },
    ),
  z.strictObject({
    type: z.literal('artifact'),
    kind: ArtifactKindSchema,
    referenceId: TextSchema,
  }),
]);

export const GradingCriteriaSchema = z
  .strictObject({
    max: z.union([z.literal(2), z.literal(3)]),
    levels: z
      .array(z.strictObject({ score: ScoreSchema, description: TextSchema }))
      .min(3)
      .max(4),
  })
  .refine(
    (criteria) =>
      criteria.levels.length === criteria.max + 1 &&
      unique(criteria.levels.map((level) => level.score)) &&
      criteria.levels.every((level) => level.score <= criteria.max),
    {
      message: 'Опиши каждый балл от 0 до максимума ровно один раз.',
      path: ['levels'],
    },
  );

export const TaskInstanceSchema = z
  .strictObject({
    id: TextSchema,
    generatorId: TextSchema,
    seed: z.string(),
    taskNumber: TaskNumberSchema,
    examPart: z.union([z.literal(1), z.literal(2)]),
    subtype: TextSchema,
    variant13: z.enum(['presentation', 'document']).optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topics: z.array(TextSchema).min(1).refine(unique),
    statement: TextSchema,
    figure: FigureSpecSchema.optional(),
    answer: CorrectAnswerSchema,
    solution: z
      .array(
        z.strictObject({
          text: TextSchema,
          code: TextSchema.optional(),
          formula: TextSchema.optional(),
        }),
      )
      .min(3),
    hints: z.tuple([TextSchema, TextSchema, TextSchema]),
    commonMistakes: z.array(
      z.strictObject({ answer: TextSchema, explanation: TextSchema }),
    ),
    criteria: GradingCriteriaSchema.optional(),
    datasetId: TextSchema.optional(),
  })
  .superRefine((task, context) => {
    const error = (field: string, message: string) => {
      context.addIssue({ code: 'custom', path: [field], message });
    };
    const rule = examConfig.tasks[task.taskNumber];
    if (task.examPart !== rule.examPart)
      error('examPart', 'Часть 1: №1–10; часть 2: №11–16.');
    if (task.taskNumber === 13 ? !task.variant13 : task.variant13 !== undefined)
      error('variant13', 'Ветка обязательна только для №13.');
    if (rule.assessment === 'short-answer') {
      if (task.answer.type === 'artifact')
        error('answer', 'Для №1–12 нужен краткий ответ.');
      if (task.criteria !== undefined)
        error(
          'criteria',
          'Для краткого ответа критерии практической работы не применяются.',
        );
    } else {
      const max = rule.maxScore;
      if (task.criteria?.max !== max)
        error('criteria', `Нужны критерии с максимумом ${String(max)}.`);
      if (
        task.answer.type !== 'artifact' ||
        !rule.artifactKinds.some(
          (kind) =>
            task.answer.type === 'artifact' && kind === task.answer.kind,
        ) ||
        (task.taskNumber === 13 && task.answer.kind !== task.variant13)
      )
        error('answer', 'Вид практической работы не соответствует номеру.');
    }
  });
