import { expect, test, vi } from 'vitest';
import {
  buildSummaryRequest,
  summaryRequestSchema,
  type SummaryRequest,
} from '../../src/lib/ai/summary-contract';
import { buildFixedVariant, variantSeed } from '../../src/core/variants';
import { createExamDraft } from '../../src/core/variants/exam';
import { scoreAttempt } from '../../src/core/variants/result';
import { createApiSummaryProvider } from '../../src/lib/ai/api-provider';
import { consumeCachedSummary } from '../../src/lib/ai/feedback';
import { SessionCache } from '../../src/core/storage/cache';

const variant = buildFixedVariant('V01');
const attempt = {
  ...createExamDraft(
    {
      id: 'summary',
      variantId: 'V01',
      seed: variantSeed(variant),
      variant13: 'presentation',
    },
    0,
  ),
  answers: [
    {
      taskNumber: 16 as const,
      text: 'PRIVATE CODE',
      reasoning: 'PRIVATE DRAFT',
    },
  ],
  finishedAt: new Date(1000).toISOString(),
  score: null,
};
const input: SummaryRequest = buildSummaryRequest(
  attempt,
  scoreAttempt(variant, attempt),
);
const signal = () => new AbortController().signal;
test('summary derives only aggregates; unknown timing and missing practice grades stay null', () => {
  const json = JSON.stringify(input);
  expect(json).not.toContain('PRIVATE');
  expect(input.results).toHaveLength(16);
  expect(input.results.every((row) => row.timeSec === null)).toBe(true);
  expect(
    input.results
      .filter((row) => row.n >= 13)
      .every((row) => row.score === null),
  ).toBe(true);
  expect(input.part2Self).toEqual([]);
  expect(
    summaryRequestSchema.safeParse({ ...input, answers: ['PRIVATE'] }).success,
  ).toBe(false);
});
test('summary SSE uses only the fixed summary endpoint and requires its separate consent', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('data: {"delta":"План"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
  const provider = createApiSummaryProvider(transport, () => false);
  await expect(
    consumeCachedSummary(
      provider,
      input,
      signal(),
      () => undefined,
      new SessionCache(() => {
        throw new Error('No storage');
      }),
    ),
  ).rejects.toThrow('consent');
  expect(transport).not.toHaveBeenCalled();
  const allowed = createApiSummaryProvider(transport, () => true);
  for await (const text of allowed.streamSummary(input, signal()))
    expect(text).toBe('План');
  expect(transport).toHaveBeenCalledWith(
    '/api/ai/variant-summary',
    expect.objectContaining({
      body: JSON.stringify(input),
      credentials: 'omit',
    }),
  );
});
test('summary cache is invalidated by changed scores and never saves a truncated stream', async () => {
  const cache = new SessionCache(() => {
    throw new Error('No storage');
  });
  const stream = vi.fn(async function* () {
    yield Promise.resolve(
      '### План\n[[stream:16]] [внешний](https://outside.test)',
    );
  });
  const update = vi.fn();
  const provider = { streamSummary: stream };
  await consumeCachedSummary(provider, input, signal(), update, cache);
  await consumeCachedSummary(provider, input, signal(), update, cache);
  expect(stream).toHaveBeenCalledOnce();
  const changed = {
    ...input,
    results: input.results.map((row) =>
      row.n === 16 ? { ...row, score: 1 as const } : row,
    ),
  };
  await consumeCachedSummary(provider, changed, signal(), update, cache);
  expect(stream).toHaveBeenCalledTimes(2);
  expect(update.mock.calls.at(-1)?.[0]).toContain('noopener');
  expect(update.mock.calls.at(-1)?.[0]).not.toContain('outside.test');
  const broken = {
    streamSummary: async function* () {
      yield Promise.resolve('Часть');
      throw new Error('Disconnected');
    },
  };
  await expect(
    consumeCachedSummary(
      broken,
      { ...input, variantSeed: 'broken' },
      signal(),
      update,
      cache,
    ),
  ).rejects.toThrow('Disconnected');
  expect(cache.snapshot().entries).toHaveLength(2);
});
