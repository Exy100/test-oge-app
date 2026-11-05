import { afterEach, expect, test, vi } from 'vitest';
import { streamResponse } from '../../worker/src/provider-stream';
import { parseAnthropicGrade } from '../../worker/src/anthropic-response';
import { CallScope } from '../../worker/src/transport';
import { createOpenRouter } from '../../worker/src/openrouter';
import {
  nativeCompletion,
  nativeStream,
  nativeEvent,
} from '../fixtures/anthropic-data';
import {
  preparedProgram,
  preparedOffice,
  programGrade,
  officeGrade,
  preparedFeedback,
} from '../fixtures/openrouter-data';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});
const signal = () => new AbortController().signal;
const settings = {
  AI_PROVIDER: 'routerai',
  SITE_ORIGIN: 'https://local.example',
  ROUTERAI_API_KEY: 'fixture-credential',
  AI_MODEL_PRIMARY: 'anthropic/claude-sonnet-5.5',
  AI_MODEL_FALLBACK: 'anthropic/claude-opus-5.5',
};

test('native SSE survives byte splits and strips thinking, signature and usage', async () => {
  const bytes = new TextEncoder().encode(nativeStream());
  let i = 0;
  const source = new Response(
    new ReadableStream({
      pull(c) {
        if (i === bytes.length) c.close();
        else c.enqueue(bytes.slice(i, ++i));
      },
    }),
  );
  const result = await streamResponse(
    source,
    new CallScope(signal()),
    true,
  ).text();
  expect(result).toContain('Разбор готов.');
  expect(result).toContain('data: [DONE]');
  expect(result).not.toMatch(/PRIVATE_THINKING|usage|thinking|output_tokens/);
});

test.each([
  nativeStream('text', 'max_tokens'),
  nativeStream().replace(nativeEvent('message_stop'), ''),
  nativeStream().replace(nativeEvent('content_block_stop', { index: 1 }), ''),
  nativeStream().replace('"text_delta"', '"thinking_delta"'),
  nativeStream('').replace('"end_turn"', '"tool_use"'),
  nativeEvent('error', { error: { message: 'PRIVATE_PROVIDER_ERROR' } }),
  nativeStream('x'.repeat(12001)),
])('rejects incomplete, mismatched or oversized native SSE %#', async (raw) => {
  const result = await streamResponse(
    new Response(raw),
    new CallScope(signal()),
    true,
  ).text();
  expect(result).toContain('event: error');
  expect(result).not.toContain('data: [DONE]');
  expect(result).not.toContain('PRIVATE_PROVIDER_ERROR');
});

test('native JSON keeps grading rules and rejects truncation and markdown fences', async () => {
  expect(
    parseAnthropicGrade(
      await nativeCompletion(programGrade).text(),
      preparedProgram.assessment,
    ),
  ).toEqual(programGrade);
  expect(
    parseAnthropicGrade(
      await nativeCompletion(officeGrade).text(),
      preparedOffice.assessment,
    ),
  ).toEqual(officeGrade);
  for (const response of [
    nativeCompletion(programGrade, 'max_tokens'),
    nativeCompletion('```json\n' + JSON.stringify(programGrade) + '\n```'),
    nativeCompletion(programGrade),
  ]) {
    const raw = await response.text();
    expect(() => parseAnthropicGrade(raw, preparedOffice.assessment)).toThrow();
  }
});

test('a slow invalid first grade leaves a full deadline for the second configured model', async () => {
  vi.useFakeTimers();
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(nativeCompletion('invalid'));
          }, 110000),
        ),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(nativeCompletion(programGrade));
          }, 110000),
        ),
    );
  const pending = createOpenRouter(settings, transport).respond(
    preparedProgram,
    signal(),
  );
  await vi.advanceTimersByTimeAsync(220000);
  expect(await (await pending).json()).toEqual(programGrade);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

test('native stalled stream expires at 120 seconds and cancels upstream', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ),
  );
  const response = await createOpenRouter(settings, transport).respond(
    preparedFeedback,
    signal(),
  );
  const text = response.text();
  await vi.advanceTimersByTimeAsync(119999);
  expect(cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await text).toContain('timeout');
  expect(cancel).toHaveBeenCalled();
});

test('RouterAI browser JSON allows a slow fallback but remains bounded', async () => {
  vi.stubEnv('PUBLIC_AI_PROVIDER', 'routerai');
  vi.resetModules();
  const { apiJson } = await import('../../src/lib/ai/http');
  vi.useFakeTimers();
  const pending = apiJson(
    '/api/ai/part2-grade',
    {},
    signal(),
    () =>
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(Response.json(programGrade));
        }, 220000),
      ),
  );
  await vi.advanceTimersByTimeAsync(220000);
  expect(await pending).toEqual(programGrade);
  const stalled = apiJson(
    '/api/ai/part2-grade',
    {},
    signal(),
    () => new Promise(() => undefined),
  );
  const rejection = expect(stalled).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(245000);
  await rejection;
});
