import { defineCollection } from 'astro:content';
import { lessonLoader } from '../scripts/quality/lesson-loader.mjs';
import { lessonSchema } from './lib/lessons/schema.ts';

const lessons = defineCollection({
  loader: lessonLoader(),
  schema: lessonSchema,
});

export const collections = { lessons };
