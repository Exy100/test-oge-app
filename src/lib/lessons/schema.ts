import { z } from '../../core/zod.ts';
import config from '../../../coverage.config.ts';

const nonempty = z.string().refine((value) => value.trim().length > 0, {
  message: 'Нужна непустая строка.',
});

/** Shared by the Astro collection and the MDX inventory checker. */
export function createLessonSchema(sections: Readonly<Record<string, number>>) {
  return z.object({
    id: nonempty,
    title: nonempty,
    section: nonempty.refine((value) => Object.hasOwn(sections, value), {
      message: 'Неизвестный раздел урока.',
    }),
    taskNumbers: z
      .array(z.number().int().min(1).max(16))
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: 'taskNumbers: номера не должны повторяться.',
      }),
    readingMinutes: z.number().int().positive(),
    prerequisites: z
      .array(nonempty)
      .refine((values) => new Set(values).size === values.length, {
        message: 'prerequisites: идентификаторы не должны повторяться.',
      }),
  });
}

export const lessonSchema = createLessonSchema(config.lessons.sections);
export type LessonMetadata = z.infer<typeof lessonSchema>;
