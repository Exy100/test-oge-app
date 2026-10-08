import { z } from 'zod';
import { examConfig } from '../exam/exam.config';
import { TextSchema, unique } from './shared';
import { TaskInstanceSchema } from './task';

const fields = {
  id: TextSchema,
  tasks: z.array(TaskInstanceSchema).length(examConfig.taskCount),
};
export const VariantSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('generated'),
      seed: z.string(),
      ...fields,
    }),
    z.strictObject({ kind: z.literal('fixed'), ...fields }),
  ])
  .superRefine((variant, context) => {
    if (!unique(variant.tasks.map((task) => task.taskNumber)))
      context.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'Каждый номер 1–16 нужен ровно один раз.',
      });
    if (!unique(variant.tasks.map((task) => task.id)))
      context.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'Идентификаторы заданий должны быть уникальны.',
      });
    const max = variant.tasks.reduce(
      (sum, task) => sum + (task.criteria?.max ?? 1),
      0,
    );
    if (max !== examConfig.maxScore)
      context.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'Максимум варианта должен быть равен 21.',
      });
  });
