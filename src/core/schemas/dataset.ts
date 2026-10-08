import { z } from 'zod';
import {
  NaturalSchema,
  RelativePathSchema,
  TextSchema,
  unique,
} from './shared';

const extensions = {
  txt: '.txt',
  csv: '.csv',
  json: '.json',
  odt: '.odt',
  odp: '.odp',
  ods: '.ods',
  zip: '.zip',
  png: '.png',
  svg: '.svg',
  py: '.py',
  kum: '.kum',
} as const;
export const DatasetFileSchema = z
  .strictObject({
    path: RelativePathSchema,
    format: z.enum([
      'txt',
      'csv',
      'json',
      'odt',
      'odp',
      'ods',
      'zip',
      'png',
      'svg',
      'py',
      'kum',
    ]),
    size: NaturalSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    license: TextSchema,
  })
  .refine((file) => file.path.endsWith(extensions[file.format]), {
    message: 'Расширение пути должно совпадать с форматом.',
    path: ['path'],
  });
const fields = {
  id: TextSchema,
  seed: z.string(),
  generatorVersion: TextSchema,
  files: z
    .array(DatasetFileSchema)
    .min(1)
    .refine(
      (files) => unique(files.map((file) => file.path)),
      'Пути файлов должны быть уникальны.',
    ),
};
export const DatasetManifestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('generated'),
    generatorId: TextSchema,
    ...fields,
  }),
  z.strictObject({ kind: z.literal('curated'), author: TextSchema, ...fields }),
]);
