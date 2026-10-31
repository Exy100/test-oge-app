import { afterEach, expect, test, vi } from 'vitest';
import { apiJson, checkAiHealth } from '../../src/lib/ai/http';

afterEach(() => vi.useRealTimers());
const signal = () => new AbortController().signal;
test('health is same-origin, private and accepts only a strict enabled response', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ enabled: true }));
  await checkAiHealth(signal(), transport);
  expect(transport).toHaveBeenCalledWith(
    '/api/ai/health',
    expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    }),
  );
  for (const body of [
    { enabled: false },
    { enabled: 'true' },
    { enabled: true, key: 'unknown' },
  ]) {
    transport.mockResolvedValue(Response.json(body));
    await expect(checkAiHealth(signal(), transport)).rejects.toThrow();
  }
});
test.each(['text/html', 'text/event-stream'])(
  'health rejects %s',
  async (contentType) => {
    await expect(
      checkAiHealth(signal(), () =>
        Promise.resolve(
          new Response('{"enabled":true}', {
            headers: { 'Content-Type': contentType },
          }),
        ),
      ),
    ).rejects.toThrow('invalid-response');
  },
);
test('health limits response bytes', async () => {
  await expect(
    checkAiHealth(signal(), () =>
      Promise.resolve(
        Response.json({ enabled: true, padding: 'a'.repeat(2000) }),
      ),
    ),
  ).rejects.toThrow('invalid-response');
});
test('health deadline covers a noncooperative fetch and cancels its late body', async () => {
  vi.useFakeTimers();
  let deliver: ((response: Response) => void) | undefined;
  const cancel = vi.fn();
  const result = checkAiHealth(
    signal(),
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  const failure = expect(result).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(5000);
  await failure;
  deliver?.(
    new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  await Promise.resolve();
  expect(cancel).toHaveBeenCalledOnce();
});
test('JSON cancellation reaches a stalled reader', async () => {
  const controller = new AbortController();
  const cancel = vi.fn();
  const result = apiJson('/api/ai/health', undefined, controller.signal, () =>
    Promise.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  const failure = expect(result).rejects.toThrow('Stop');
  await Promise.resolve();
  controller.abort(new Error('Stop'));
  await failure;
  expect(cancel).toHaveBeenCalledOnce();
});
