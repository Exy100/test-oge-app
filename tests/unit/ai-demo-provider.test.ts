import { expect, test, vi } from 'vitest';
import { generators } from '../../src/core/generators';
import { demoFeedbackProvider } from '../../src/lib/ai/demo-provider';
import type { FeedbackRequest } from '../../src/lib/ai/contract';

const generator = generators.find((item) => item.id === 'numeral-sum-v2');
if (!generator) throw new Error('Missing numeral generator');
const task = generator.generate('ai-demo');
if (task.answer.type !== 'integer') throw new Error('Expected integer answer');
const request: FeedbackRequest = {
  generatorId: task.generatorId,
  seed: task.seed,
  answer: task.answer.value,
  reasoning: 'PRIVATE_DEMO_NOTE',
};

async function response(input: FeedbackRequest) {
  let text = '';
  for await (const chunk of demoFeedbackProvider.streamFeedback(
    input,
    new AbortController().signal,
  ))
    text += chunk;
  return text;
}

test('selects an honest example for the checked answer without network calls or mutation', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const before = structuredClone(request);
  try {
    const text = await response(request);
    expect(text).toContain('Пример для верного ответа');
    expect(text).toContain('Заготовка');
    expect(text).not.toContain(request.reasoning);
    expect(request).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

test('selects the other example for a valid incorrect answer', async () => {
  expect(
    await response({ ...request, answer: String(BigInt(request.answer) + 1n) }),
  ).toContain('Пример для неверного ответа');
});

test.each(['unknown-generator', 'python-positive-mean-v1'])(
  'rejects an unsupported source %s instead of inventing a grade',
  async (generatorId) => {
    await expect(response({ ...request, generatorId })).rejects.toMatchObject({
      code: 'invalid-request',
    });
  },
);

test('rejects malformed answer and forged request fields', async () => {
  await expect(response({ ...request, answer: 'abc' })).rejects.toMatchObject({
    code: 'invalid-request',
  });
  const forged = { ...request, solution: 'Forged solution' };
  await expect(response(forged)).rejects.toMatchObject({
    code: 'invalid-request',
  });
});

test('abort interrupts a pending chunk and closes the stream', async () => {
  const controller = new AbortController();
  const iterator = demoFeedbackProvider
    .streamFeedback(request, controller.signal)
    [Symbol.asyncIterator]();
  expect((await iterator.next()).done).toBe(false);
  const next = iterator.next();
  controller.abort();
  await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  expect((await iterator.next()).done).toBe(true);
});
