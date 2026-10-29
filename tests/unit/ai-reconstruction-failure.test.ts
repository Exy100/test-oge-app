import { afterEach, expect, test, vi } from 'vitest';

vi.mock('../../src/core/generators', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/generators')>();
  const original = actual.generators[0];
  if (!original) throw new Error('Нет исходного генератора.');
  return {
    ...actual,
    generators: [
      ...actual.generators,
      {
        ...original,
        id: 'broken-test-v1',
        generate(seed: string) {
          if (seed === 'throws') throw new Error('private-engine-diagnostics');
          const task = original.generate(seed);
          return seed === 'identity'
            ? task
            : { ...task, generatorId: 'broken-test-v1' };
        },
        verify() {
          return false;
        },
      },
    ],
  };
});

import worker from '../../worker/src/index';

afterEach(() => {
  vi.restoreAllMocks();
});
for (const seed of ['throws', 'identity', 'invalid-verification']) {
  test(`internal generator failure ${seed} is a private 500 with protective headers`, async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const loggers = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const origin = 'https://exy100.github.io';
    const response = await worker.fetch(
      new Request(origin + '/api/ai/stream-feedback', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatorId: 'broken-test-v1',
          seed,
          answer: 'private-student-text',
        }),
      }),
      { SITE_ORIGIN: origin },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'task-unavailable',
        message: 'Не удалось проверить задание. Попробуй ещё раз.',
      },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe(
      'same-origin',
    );
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(network).not.toHaveBeenCalled();
    for (const logger of loggers) expect(logger).not.toHaveBeenCalled();
  });
}
