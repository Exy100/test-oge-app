import { expect, test } from 'vitest';
import {
  buildFixedVariant,
  buildVariant,
  fixedVariants,
  variant13Alternatives,
  variantSeed,
  VARIANT_VERSION,
} from '../core/variants';
import { resolveStreamTask } from '../core/stream/catalog';
import { parseStreamQuery } from './stream-url';
import type { Areas } from '../core/storage/schemas';
import {
  fixedVariantHref,
  randomVariantHref,
  readVariantSeed,
  variantTaskHref,
  attemptVariantHref,
  VariantLinkError,
  variantPrintHref,
  readPrintIdentity,
  attemptResultHref,
  readResultAttempt,
} from './variant-links';

test('result links keep attempt IDs local and exact, rejecting absent or ambiguous records', () => {
  for (const identity of [
    { variantId: 'V01', seed: `${VARIANT_VERSION}:V01` },
    { variantId: `${VARIANT_VERSION}:Случайный + 🧩`, seed: 'Случайный + 🧩' },
  ]) {
    const href = attemptResultHref({ ...identity, id: 'попытка + /?&🧩' });
    expect(href).not.toBeNull();
    const url = new URL(href ?? '', 'https://example.test');
    expect(url.pathname).toContain('/result/');
    expect(readResultAttempt(url.search)).toBe('попытка + /?&🧩');
    expect([...url.searchParams.keys()]).toEqual(['attempt']);
  }
  expect(
    attemptResultHref({ variantId: 'V01', seed: 'wrong', id: 'x' }),
  ).toBeNull();
  expect(
    attemptResultHref({
      variantId: 'V01',
      seed: `${VARIANT_VERSION}:V01`,
      id: '',
    }),
  ).toBeNull();
  for (const search of [
    '',
    '?attempt=',
    '?attempt=a&attempt=b',
    '?attempt=' + 'a'.repeat(201),
    '?' + 'a'.repeat(8192),
  ])
    expect(() => readResultAttempt(search)).toThrow(VariantLinkError);
});

test('print links preserve fixed identities and exact random seeds and reject ambiguity', () => {
  for (const fixed of fixedVariants) {
    const identity = { variantId: fixed.id, seed: fixed.seed };
    expect(
      readPrintIdentity(
        new URL(variantPrintHref(identity), 'https://example.test').search,
      ),
    ).toEqual(identity);
  }
  for (const seed of [
    '',
    'Пример + /?&🧩',
    '<script>alert(1)</script>',
    'x'.repeat(200),
  ]) {
    const identity = { variantId: `${VARIANT_VERSION}:${seed}`, seed };
    expect(
      readPrintIdentity(
        new URL(variantPrintHref(identity), 'https://example.test').search,
      ),
    ).toEqual(identity);
  }
  for (const query of [
    '',
    '?id=V11',
    '?id=V01&id=V02',
    '?id=V01&seed=x',
    '?seed=a&seed=b',
    '?seed=' + 'x'.repeat(201),
    '?' + 'x'.repeat(8192),
  ])
    expect(() => readPrintIdentity(query)).toThrow(VariantLinkError);
});

test('catalogue contains ten working fixed paths and rejects absent or external identities', () => {
  expect(fixedVariants).toHaveLength(10);
  for (const { id } of fixedVariants)
    expect(fixedVariantHref(id)).toBe(`/test-oge-app/variants/${id}/`);
  for (const id of [
    'V00',
    'V11',
    '../V01',
    '//evil.example',
    'https://evil.example',
  ])
    expect(() => fixedVariantHref(id)).toThrow(TypeError);
});
test('random variant URLs preserve exact seeds and reject ambiguous or oversized queries', () => {
  for (const seed of [
    '',
    'Пример + /?&🧩',
    '<script>alert(1)</script>',
    'x'.repeat(200),
  ]) {
    const url = new URL(randomVariantHref(seed), 'https://exy100.github.io');
    expect(url.pathname).toBe('/test-oge-app/variants/random/');
    expect(readVariantSeed(url.search)).toBe(seed);
    expect(buildVariant(readVariantSeed(url.search))).toEqual(
      buildVariant(seed),
    );
  }
  for (const search of [
    '',
    '?seed=a&seed=b',
    '?seed=' + 'x'.repeat(201),
    '?' + 'x'.repeat(8192),
  ])
    expect(() => readVariantSeed(search)).toThrow(VariantLinkError);
  expect(() => randomVariantHref('x'.repeat(201))).toThrow(VariantLinkError);
});
test('all sixteen tasks and both №13 choices open the exact canonical stream task', () => {
  for (const { id } of fixedVariants) {
    const variant = buildFixedVariant(id);
    const alternatives = variant13Alternatives(variantSeed(variant));
    for (const task of [...variant.tasks, alternatives.document]) {
      const query = parseStreamQuery(
        new URL(variantTaskHref(task), 'https://exy100.github.io').search,
        [],
      );
      if (!query.reference) throw new Error('Missing stream reference');
      expect(resolveStreamTask(query.reference)).toEqual(task);
      expect(query.filters.numbers).toEqual([task.taskNumber]);
      if (task.variant13) expect(query.filters.variant13).toBe(task.variant13);
    }
  }
});
test('history links reproduce stored identity and leave unknown or inconsistent records unlinked', () => {
  const attempt: Areas['variantAttempts']['entries'][number] = {
    id: 'history-1',
    variantId: 'V01',
    seed: fixedVariants[0]?.seed ?? '',
    variant13: 'document',
    mode: 'exam',
    startedAt: '2026-10-18T01:00:00Z',
    finishedAt: '2026-10-18T02:00:00Z',
    elapsedMs: 3600000,
    answers: [],
    assessments: [],
    marked: [],
    score: null,
  };
  expect(attemptVariantHref(attempt)).toBe('/test-oge-app/variants/V01/');
  expect(attemptVariantHref({ ...attempt, seed: 'different' })).toBeNull();
  expect(
    attemptVariantHref({ ...attempt, variantId: '//evil.example' }),
  ).toBeNull();
  expect(
    attemptVariantHref({
      ...attempt,
      variantId: `${VARIANT_VERSION}:Пример`,
      seed: 'Пример',
    }),
  ).toBe(randomVariantHref('Пример'));
});
