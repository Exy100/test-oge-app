import { expect, test, vi } from 'vitest';
import {
  FeedbackError,
  feedbackErrorMessage,
  feedbackRequestSchema,
  type FeedbackProvider,
  type FeedbackRequest,
} from '../../src/lib/ai/contract';
import {
  consumeFeedback,
  MAX_FEEDBACK_LENGTH,
} from '../../src/lib/ai/feedback';
import { xssContent } from '../fixtures/xss-content';

const request: FeedbackRequest = {
  generatorId: 'numeral-sum-v2',
  seed: 'ai-demo',
  answer: '1',
  reasoning: 'Мой черновик',
};
function provider(chunks: string[]): FeedbackProvider {
  return {
    async *streamFeedback() {
      for (const chunk of chunks) yield await Promise.resolve(chunk);
    },
  };
}

test.each([
  { ...request, condition: 'Подменённое условие' },
  { ...request, generatorId: '' },
  { ...request, seed: 'x'.repeat(201) },
  { ...request, answer: 'x'.repeat(301) },
  { ...request, reasoning: 'x'.repeat(1501) },
])('rejects invalid input before calling the provider: %#', async (input) => {
  const update = vi.fn();
  const streamFeedback = vi.fn(() =>
    provider(['response']).streamFeedback(
      request,
      new AbortController().signal,
    ),
  );
  await expect(
    consumeFeedback(
      { streamFeedback },
      input,
      new AbortController().signal,
      update,
    ),
  ).rejects.toMatchObject({ code: 'invalid-request' });
  expect(streamFeedback).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test('accepts the bounded request and preserves exact input', () => {
  expect(feedbackRequestSchema.parse(request)).toEqual(request);
  expect(
    feedbackRequestSchema.parse({
      ...request,
      answer: 'я'.repeat(300),
      reasoning: 'я'.repeat(1500),
    }).reasoning,
  ).toHaveLength(1500);
});

test('renders accumulated markdown across chunk boundaries', async () => {
  const updates: string[] = [];
  await consumeFeedback(
    provider(['### Проверка\n**Первый', ' шаг**\n\n$2 + 2 = 4$']),
    request,
    new AbortController().signal,
    (html) => updates.push(html),
  );
  expect(updates).toHaveLength(2);
  expect(updates[1]).toContain('<strong>Первый шаг</strong>');
  expect(updates[1]).toContain('<math');
});

test.each(xssContent)(
  'sanitises every partial response from a replacement provider: %#',
  async (source) => {
    const updates: string[] = [];
    const middle = Math.floor(source.length / 2);
    await consumeFeedback(
      provider([source.slice(0, middle), source.slice(middle)]),
      request,
      new AbortController().signal,
      (html) => updates.push(html),
    );
    expect(updates.length).toBeGreaterThan(0);
    for (const html of updates) {
      expect(html).not.toMatch(
        /<(?:script|iframe|img|svg|a|form|input|style)\b/iu,
      );
      expect(html).not.toMatch(
        /<[^>]*\s(?:onerror|onload|onfocus|href|src|style)\s*=/iu,
      );
    }
  },
);

test.each(['', '   ', 'x'.repeat(MAX_FEEDBACK_LENGTH + 1)])(
  'rejects empty or oversized output: %#',
  async (text) => {
    const update = vi.fn<(html: string) => void>();
    await expect(
      consumeFeedback(
        provider([text]),
        request,
        new AbortController().signal,
        update,
      ),
    ).rejects.toMatchObject({ code: 'invalid-response' });
    for (const [html] of update.mock.calls) expect(html).toBe('');
  },
);

test('stops an overlong stream and closes its iterator', async () => {
  let closed = false;
  const updates: string[] = [];
  const source: FeedbackProvider = {
    async *streamFeedback() {
      try {
        yield await Promise.resolve('x'.repeat(MAX_FEEDBACK_LENGTH));
        yield 'extra';
        yield 'unreachable';
      } finally {
        closed = true;
      }
    },
  };
  await expect(
    consumeFeedback(source, request, new AbortController().signal, (html) =>
      updates.push(html),
    ),
  ).rejects.toMatchObject({ code: 'invalid-response' });
  expect(closed).toBe(true);
  expect(updates).toHaveLength(1);
});

test('aborted requests never call the provider', async () => {
  const controller = new AbortController();
  controller.abort();
  const streamFeedback = vi.fn(() =>
    provider(['late']).streamFeedback(request, controller.signal),
  );
  const update = vi.fn();
  await expect(
    consumeFeedback({ streamFeedback }, request, controller.signal, update),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(streamFeedback).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test('late chunks from a provider that ignores abort cannot update the view', async () => {
  const controller = new AbortController();
  let release: () => void = () => {
    throw new Error('Gate is not initialised');
  };
  let first: () => void = () => {
    throw new Error('Signal is not initialised');
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    first = resolve;
  });
  const source: FeedbackProvider = {
    async *streamFeedback() {
      yield 'Первый фрагмент';
      await gate;
      yield 'Запоздалый фрагмент';
    },
  };
  const updates: string[] = [];
  const result = consumeFeedback(source, request, controller.signal, (html) => {
    updates.push(html);
    first();
  });
  await received;
  controller.abort();
  release();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(updates).toHaveLength(1);
});

test('errors from a transport never expose its raw message', () => {
  const message = feedbackErrorMessage(new Error('private transport detail'));
  expect(message).toContain('твой ответ и черновик сохранены');
  expect(message).not.toContain('private');
  expect(feedbackErrorMessage(new FeedbackError('invalid-request'))).toContain(
    'до 300 символов',
  );
});
