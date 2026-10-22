import { describe, expect, it } from 'vitest';
import { lessonSchema } from '../../src/lib/lessons/schema.ts';

const metadata = {
  id: 'text-volume',
  title: 'Объём текста',
  section: 'i1',
  taskNumbers: [1],
  readingMinutes: 5,
  prerequisites: [],
};

describe('lesson metadata', () => {
  it('accepts empty prerequisites and multiple exam task numbers', () => {
    expect(lessonSchema.parse(metadata)).toEqual(metadata);
    expect(
      lessonSchema.safeParse({ ...metadata, taskNumbers: [4, 9] }).success,
    ).toBe(true);
  });

  it.each(Object.keys(metadata))('requires the %s field', (field) => {
    const incomplete = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => key !== field),
    );
    expect(lessonSchema.safeParse(incomplete).success).toBe(false);
  });

  it.each([
    { id: ' ' },
    { title: '' },
    { section: 'i15' },
    { taskNumbers: [] },
    { taskNumbers: [0] },
    { taskNumbers: [17] },
    { taskNumbers: [1.5] },
    { taskNumbers: [1, 1] },
    { taskNumbers: ['1'] },
    { readingMinutes: 0 },
    { readingMinutes: 1.5 },
    { readingMinutes: '5' },
    { prerequisites: ['bits', 'bits'] },
    { prerequisites: [' '] },
  ])('rejects invalid author metadata: %j', (change) => {
    expect(lessonSchema.safeParse({ ...metadata, ...change }).success).toBe(
      false,
    );
  });
});
