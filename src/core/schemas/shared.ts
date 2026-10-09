import { z } from '../zod';

export const TextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: 'Нужен непустой текст.',
  });
export const FiniteNumberSchema = z
  .number()
  .refine((value) => !Object.is(value, -0), {
    message: 'Отрицательный ноль недопустим.',
  });
export const NaturalSchema = FiniteNumberSchema.pipe(
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);
export const TaskNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
  z.literal(15),
  z.literal(16),
]);
export const ScoreSchema = z
  .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
  .refine((value) => !Object.is(value, -0));
export const ArtifactKindSchema = z.enum([
  'presentation',
  'document',
  'spreadsheet',
  'robot',
  'program',
]);
export const AnswerTypeSchema = z.enum([
  'integer',
  'word',
  'sequence',
  'artifact',
]);

/** Canonical relative paths only: never decode or normalise untrusted input. */
export const RelativePathSchema = TextSchema.refine(
  (path) =>
    !/[\\:%?#]|\p{Cc}/u.test(path) &&
    path
      .split('/')
      .every(
        (part) =>
          part !== '' && part !== '.' && part !== '..' && part.trim() === part,
      ),
  {
    message:
      'Нужен безопасный относительный путь без URL и переходов между каталогами.',
  },
);

export function unique(values: readonly (string | number)[]): boolean {
  return new Set(values).size === values.length;
}
