import { afterEach, expect, test, vi } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import worker from '../../worker/src/index';

const origin = 'https://exy100.github.io';
const env = { SITE_ORIGIN: origin };
const feedback = {
  generatorId: 'numeral-sum-v2',
  seed: 'boundary',
  answer: '12',
};
const generatedWork = {
  generatorId: 'python-positive-mean-v1',
  seed: 'boundary',
  solution: 'print(12)',
};
const summary = {
  variantSeed: 'V01',
  results: [{ n: 1, score: 1, timeSec: 60 }],
  part2Self: [{ n: 14, score: null }],
};
function post(body: unknown = feedback, path = 'stream-feedback', extra = {}) {
  return new Request(`${origin}/api/ai/${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
}
function checkHeaders(response: { headers: Pick<Headers, 'get' | 'has'> }) {
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Type')).toContain('application/json');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "default-src 'none'",
  );
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get('Strict-Transport-Security')).toContain(
    'max-age=31536000',
  );
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
  expect(response.headers.get('Vary')).toBe('Origin');
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  expect(response.headers.has('Set-Cookie')).toBe(false);
}
afterEach(() => {
  vi.restoreAllMocks();
});

test('same-origin health GET works without Origin and reports the real disabled state', async () => {
  const response = await worker.fetch(
    new Request(`${origin}/api/ai/health`),
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: false });
  checkHeaders(response);
});

for (const [path, body] of [
  ['stream-feedback', feedback],
  ['part2-grade', generatedWork],
  [
    'part2-grade',
    {
      bankId: 'P01',
      solution: 'Моя работа',
      criteriaAnswers: { title: 'Есть заголовок' },
    },
  ],
  ['variant-summary', summary],
] as const) {
  test(`valid ${path} is explicitly disabled without network or logging`, async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network'));
    const log = vi.spyOn(console, 'log');
    const info = vi.spyOn(console, 'info');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const response = await worker.fetch(post(body, path), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'ai-disabled',
        message: 'ИИ отключён. Доступен локальный пример на сайте.',
      },
    });
    expect(network).not.toHaveBeenCalled();
    for (const logger of [log, info, warn, error])
      expect(logger).not.toHaveBeenCalled();
    checkHeaders(response);
  });
}

for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
  test(`${method} cannot call a POST route`, async () => {
    const response = await worker.fetch(
      new Request(`${origin}/api/ai/stream-feedback`, {
        method,
        headers: { Origin: origin },
      }),
      env,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    checkHeaders(response);
  });
}
test('health is GET-only; unknown paths are not silently routed to feedback', async () => {
  const response = await worker.fetch(post({}, 'health'), env);
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('GET');
  for (const path of [
    'other',
    'stream-feedback/extra',
    'stream-feedback%2fextra',
  ]) {
    const missing = await worker.fetch(post({}, path), env);
    expect(missing.status).toBe(404);
    checkHeaders(missing);
  }
});

for (const supplied of [
  '',
  'null',
  'https://exy100.github.io.evil.test',
  'http://exy100.github.io',
  'https://exy100.github.io:444',
  'https://evil.test',
  origin + '/',
]) {
  test(`Origin must match exactly: ${JSON.stringify(supplied)}`, async () => {
    const request = post();
    if (supplied) request.headers.set('Origin', supplied);
    else request.headers.delete('Origin');
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    checkHeaders(response);
  });
}
test('health rejects foreign Origin and missing Origin on a different host', async () => {
  for (const request of [
    new Request(`${origin}/api/ai/health`, {
      headers: { Origin: 'https://evil.test' },
    }),
    new Request('https://worker.test/api/ai/health'),
  ]) {
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(403);
    checkHeaders(response);
  }
});
for (const value of [
  '',
  'not a URL',
  'null',
  'http://public.test',
  'https://user:pass@site.test',
  origin + '/',
  origin + '/path',
]) {
  test(`invalid configured origin keeps the service unavailable: ${JSON.stringify(value)}`, async () => {
    const response = await worker.fetch(post(), { SITE_ORIGIN: value });
    expect(response.status).toBe(503);
    expect((await response.json()) as unknown).toEqual({
      error: { code: 'configuration', message: 'Сервис разбора недоступен.' },
    });
    checkHeaders(response);
  });
}
test('an explicitly configured HTTP loopback origin supports local development', async () => {
  const local = 'http://127.0.0.1:4321';
  const response = await worker.fetch(new Request(local + '/api/ai/health'), {
    SITE_ORIGIN: local,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: false });
});

for (const [label, body] of [
  ['extra client answer', { ...feedback, correctAnswer: '12' }],
  ['extra statement', { ...feedback, statement: 'Untrusted task' }],
  ['answer limit', { ...feedback, answer: 'x'.repeat(301) }],
  ['reasoning limit', { ...feedback, reasoning: 'x'.repeat(1501) }],
  ['generator limit', { ...feedback, generatorId: 'x'.repeat(201) }],
  ['seed limit', { ...feedback, seed: 'x'.repeat(201) }],
  ['array', []],
  ['null', null],
] as const) {
  test(`feedback rejects ${label}`, async () => {
    const response = await worker.fetch(post(body), env);
    expect(response.status).toBe(400);
    checkHeaders(response);
  });
}
for (const body of [
  { ...generatedWork, bankId: 'P01' },
  { generatorId: generatedWork.generatorId, solution: 'x' },
  { ...generatedWork, solution: 'x'.repeat(3001) },
  { ...generatedWork, criteriaAnswers: { answer: { nested: 'not a string' } } },
]) {
  test('part2 rejects ambiguous identity, missing seed and oversized or structured work', async () => {
    const response = await worker.fetch(post(body, 'part2-grade'), env);
    expect(response.status).toBe(400);
    checkHeaders(response);
  });
}
for (const n of [1, 13, 15, 16]) {
  test(`summary rejects excessive score for task ${String(n)}`, async () => {
    const response = await worker.fetch(
      post(
        { ...summary, results: [{ n, score: 3, timeSec: 1 }] },
        'variant-summary',
      ),
      env,
    );
    expect(response.status).toBe(400);
  });
}
test('summary preserves ungraded work, accepts three points only for 14 and rejects answer texts', async () => {
  const valid = {
    ...summary,
    results: [{ n: 14, score: 3, timeSec: 60 }],
    part2Self: [{ n: 13, score: null }],
  };
  expect((await worker.fetch(post(valid, 'variant-summary'), env)).status).toBe(
    503,
  );
  for (const body of [
    { ...valid, answer: 'private text' },
    { ...valid, results: [{ ...valid.results[0], answer: 'private text' }] },
    { ...valid, results: [valid.results[0], valid.results[0]] },
    { ...valid, results: [], part2Self: [] },
    { ...valid, part2Self: [{ n: 15, score: 3 }] },
    { ...valid, part2Self: [{ n: 1, score: 1 }] },
  ])
    expect(
      (await worker.fetch(post(body, 'variant-summary'), env)).status,
    ).toBe(400);
});

for (const media of [
  'text/plain',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  '',
]) {
  test(`non-JSON media is rejected: ${JSON.stringify(media)}`, async () => {
    const request = post();
    if (media) request.headers.set('Content-Type', media);
    else request.headers.delete('Content-Type');
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(415);
    checkHeaders(response);
  });
}
test('JSON media accepts charset, rejects compressed and malformed bodies without reflecting input', async () => {
  expect(
    (
      await worker.fetch(
        post(feedback, 'stream-feedback', {
          'Content-Type': 'Application/JSON; charset=UTF-8',
        }),
        env,
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await worker.fetch(
        post(feedback, 'stream-feedback', { 'Content-Encoding': 'gzip' }),
        env,
      )
    ).status,
  ).toBe(415);
  for (const body of [
    '{private-student-text',
    '',
    new Uint8Array([0xff, 0xfe]),
  ]) {
    const request = new Request(`${origin}/api/ai/stream-feedback`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private-student-text');
    checkHeaders(response);
  }
});
test('the exact byte limit is accepted, excessive raw and UTF-8 bytes are rejected', async () => {
  const encoded = JSON.stringify(feedback);
  for (const [body, status] of [
    [encoded.padEnd(8192, ' '), 503],
    [encoded.padEnd(8193, ' '), 413],
    [JSON.stringify({ ...feedback, reasoning: 'Ж'.repeat(4500) }), 413],
  ] as const) {
    const response = await worker.fetch(
      new Request(`${origin}/api/ai/stream-feedback`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body,
      }),
      env,
    );
    expect(response.status).toBe(status);
    checkHeaders(response);
  }
});
test('declared size cannot hide an oversized chunked body and reading stops at the limit', async () => {
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(5000));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const init = {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'Content-Length': '1',
    },
    body,
    duplex: 'half',
  };
  const response = await worker.fetch(
    new Request(`${origin}/api/ai/stream-feedback`, init),
    env,
  );
  expect(response.status).toBe(413);
  expect(pulls).toBe(2);
  expect(cancelled).toBe(true);
  checkHeaders(response);
});
test('size headers and a broken input stream fail closed', async () => {
  expect(
    (
      await worker.fetch(
        post(feedback, 'stream-feedback', { 'Content-Length': '0001' }),
        env,
      )
    ).status,
  ).toBe(503);
  for (const [length, status] of [
    ['8193', 413],
    ['-1', 400],
    ['4, 4', 400],
  ]) {
    const request = post(feedback, 'stream-feedback', {
      'Content-Length': length,
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(status);
    expect(request.bodyUsed).toBe(false);
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('private-stream-error'));
    },
  });
  const init = {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body,
    duplex: 'half',
  };
  const response = await worker.fetch(
    new Request(`${origin}/api/ai/stream-feedback`, init),
    env,
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain('private-stream-error');
});

test('the production entry runs in real Workers with the same protected boundaries', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'worker/src/index.ts', formats: ['es'] },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  const chunks = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Не собран Worker API.');
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'ai-boundary',
          compatibilityDate: '2026-10-01',
          env: { SITE_ORIGIN: { type: 'text', value: origin } },
          manifest: {
            mainModule: entry.fileName,
            modules: Object.fromEntries(
              chunks.map((chunk) => [
                chunk.fileName,
                { type: 'esm' as const, contents: chunk.code },
              ]),
            ),
          },
        },
      },
    ],
  });
  try {
    const health = await runtime.dispatchFetch(`${origin}/api/ai/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ enabled: false });
    for (const [request, status] of [
      [post(feedback), 503],
      [post(generatedWork, 'part2-grade'), 503],
      [post({ bankId: 'P01', solution: 'Моя работа' }, 'part2-grade'), 503],
      [post(summary, 'variant-summary'), 503],
      [post({ ...feedback, correctAnswer: '12' }), 400],
      [post(feedback, 'stream-feedback', { Origin: 'https://evil.test' }), 403],
      [post({ ...feedback, reasoning: 'x'.repeat(9000) }), 413],
      [
        new Request(`${origin}/api/ai/stream-feedback`, {
          headers: { Origin: origin },
        }),
        405,
      ],
    ] as const) {
      const response = await runtime.dispatchFetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        ...(request.body ? { body: await request.text() } : {}),
      });
      expect(response.status).toBe(status);
      checkHeaders(response);
    }
  } finally {
    await runtime.dispose();
  }
}, 20_000);
