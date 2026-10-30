import { afterEach, expect, test, vi } from 'vitest';
import { createConfiguredWorker } from '../../worker/src/index';
import { AiQuota, day } from '../../worker/src/quota-object';
import {
  feedbackInput,
  programInput,
  summaryInput,
  providerStream,
  completion,
} from '../fixtures/openrouter-data';
import { quotaFixture, quotaSettings } from '../fixtures/ai-quota';

function post(
  ip = '192.0.2.1',
  body: unknown = feedbackInput,
  mode = 'stream-feedback',
  headers = {},
) {
  return new Request(quotaSettings.SITE_ORIGIN + '/api/ai/' + mode, {
    method: 'POST',
    headers: {
      Origin: quotaSettings.SITE_ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function setup(limit?: string) {
  const fixture = quotaFixture(limit);
  const transport = vi.fn<typeof fetch>(() =>
    Promise.resolve(providerStream()),
  );
  const worker = createConfiguredWorker(transport);
  async function send(request = post()) {
    const response = await worker.fetch(request, fixture.env);
    const body = await response.text();
    return { response, body };
  }
  return { ...fixture, transport, worker, send };
}
async function allow(object: AiQuota, command: unknown) {
  const response = await object.fetch(
    new Request('https://quota.internal/allow', {
      method: 'POST',
      body: JSON.stringify(command),
    }),
  );
  return { status: response.status, value: (await response.json()) as unknown };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('10 requests share one allowance across all three modes; the 11th receives 429 and Retry-After', async () => {
  const fixture = setup();
  for (let i = 0; i < 10; i++) {
    const mode = i % 3;
    fixture.transport.mockResolvedValueOnce(
      mode === 1 ? completion() : providerStream(),
    );
    const { response } = await fixture.send(
      post(
        '192.0.2.1',
        mode === 1 ? programInput : mode === 2 ? summaryInput : feedbackInput,
        mode === 1
          ? 'part2-grade'
          : mode === 2
            ? 'variant-summary'
            : 'stream-feedback',
      ),
    );
    expect(response.status).toBe(200);
  }
  const { response, body } = await fixture.send();
  expect(response.status).toBe(429);
  expect(JSON.parse(body)).toMatchObject({ error: { code: 'rate-minute' } });
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  expect(fixture.transport).toHaveBeenCalledTimes(10);
});
test('sliding minute does not reset at a calendar boundary; exactly 60 seconds releases allowance', async () => {
  const fixture = setup();
  fixture.clock.now += 59_000;
  for (let i = 0; i < 10; i++) await fixture.send();
  fixture.clock.now += 1000;
  expect((await fixture.send()).response.status).toBe(429);
  fixture.clock.now += 59_000;
  expect((await fixture.send()).response.status).toBe(200);
});
test('61st request over a rolling day is blocked even after UTC midnight', async () => {
  const fixture = setup();
  const start = fixture.clock.now;
  for (let group = 0; group < 6; group++) {
    fixture.clock.now = start + group * 60_000;
    for (let i = 0; i < 10; i++)
      expect((await fixture.send()).response.status).toBe(200);
  }
  fixture.clock.now = start + 12 * 60 * 60_000;
  const { response, body } = await fixture.send();
  expect(response.status).toBe(429);
  expect(JSON.parse(body)).toMatchObject({ error: { code: 'rate-day' } });
  expect(response.headers.get('Retry-After')).toBe('43200');
  fixture.clock.now = start + day;
  expect((await fixture.send()).response.status).toBe(200);
  expect(fixture.transport).toHaveBeenCalledTimes(61);
});
test('different IPs have separate rates while their provider calls share the global counter', async () => {
  const fixture = setup('2');
  expect((await fixture.send(post('192.0.2.1'))).response.status).toBe(200);
  expect((await fixture.send(post('192.0.2.2'))).response.status).toBe(200);
  const { response, body } = await fixture.send(post('192.0.2.3'));
  expect(response.status).toBe(503);
  expect(JSON.parse(body)).toMatchObject({ error: { code: 'budget' } });
  expect(response.headers.get('Retry-After')).toBe('43200');
  expect(fixture.transport).toHaveBeenCalledTimes(2);
  expect(new Set(fixture.names)).toEqual(new Set(['global-v1']));
});
test('global budget resets at UTC midnight without changing the rolling IP allowance', async () => {
  const fixture = setup('1');
  fixture.clock.now = Date.UTC(2026, 9, 30, 23, 59, 59);
  expect((await fixture.send()).response.status).toBe(200);
  expect((await fixture.send()).response.status).toBe(503);
  fixture.clock.now += 1000;
  expect((await fixture.send()).response.status).toBe(200);
  expect(fixture.storage.values.get('budget')).toMatchObject({ count: 1 });
});
for (const status of [429, 503]) {
  test(`fallback after provider ${String(status)} cannot bypass the global budget`, async () => {
    const fixture = setup('1');
    fixture.transport.mockResolvedValueOnce(
      new Response('private-provider-details', { status }),
    );
    const { response, body } = await fixture.send();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({ error: { code: 'budget' } });
    expect(fixture.transport).toHaveBeenCalledTimes(1);
    expect(fixture.storage.values.get('budget')).toMatchObject({ count: 1 });
  });
}
test('fallback reserves a second provider call but only one IP request', async () => {
  const fixture = setup('2');
  fixture.transport.mockResolvedValueOnce(new Response(null, { status: 429 }));
  expect((await fixture.send()).response.status).toBe(200);
  expect(fixture.transport).toHaveBeenCalledTimes(2);
  expect(fixture.storage.values.get('budget')).toMatchObject({ count: 2 });
  expect(
    fixture.commands.filter(
      (command) => (command as { kind: string }).kind === 'rate',
    ),
  ).toHaveLength(1);
  expect((await fixture.send(post('192.0.2.2'))).response.status).toBe(503);
});
test('invalid JSON retry also needs its own reservation', async () => {
  const fixture = setup('1');
  fixture.transport.mockResolvedValueOnce(completion('not-json'));
  const { response, body } = await fixture.send(
    post('192.0.2.1', programInput, 'part2-grade'),
  );
  expect(response.status).toBe(503);
  expect(JSON.parse(body)).toMatchObject({ error: { code: 'budget' } });
  expect(fixture.transport).toHaveBeenCalledTimes(1);
});
test('network failures and cancelled streams do not refund potentially billable calls', async () => {
  const fixture = setup('2');
  fixture.transport.mockRejectedValueOnce(new Error('private-network-reason'));
  expect((await fixture.send()).response.status).toBe(503);
  const response = await fixture.worker.fetch(post(), fixture.env);
  await response.body?.cancel();
  expect(fixture.storage.values.get('budget')).toMatchObject({ count: 2 });
  expect((await fixture.send()).response.status).toBe(503);
  expect(fixture.transport).toHaveBeenCalledTimes(2);
});
test('concurrent requests cannot overshoot either allowance', async () => {
  const minute = setup();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => minute.send()),
  );
  expect(
    responses.filter(({ response }) => response.status === 200),
  ).toHaveLength(10);
  expect(
    responses.filter(({ response }) => response.status === 429),
  ).toHaveLength(10);
  const budget = setup('3');
  const global = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      budget.send(post(`192.0.2.${String(i + 1)}`)),
    ),
  );
  expect(global.filter(({ response }) => response.status === 200)).toHaveLength(
    3,
  );
  expect(global.filter(({ response }) => response.status === 503)).toHaveLength(
    9,
  );
  expect(budget.transport).toHaveBeenCalledTimes(3);
});
test('reconstructing the Worker and Durable Object preserves the limits in storage', async () => {
  const fixture = setup('1');
  await fixture.send();
  const object = new AiQuota(
    { storage: fixture.storage },
    fixture.env,
    () => fixture.clock.now,
  );
  expect(await allow(object, { kind: 'budget' })).toMatchObject({
    value: { allowed: false, code: 'budget' },
  });
  const server = createConfiguredWorker(fixture.transport);
  expect((await server.fetch(post('192.0.2.2'), fixture.env)).status).toBe(503);
  expect(fixture.transport).toHaveBeenCalledTimes(1);
});
test('malformed input consumes rate allowance but never consumes provider budget; health is free', async () => {
  const fixture = setup('1');
  const health = await fixture.worker.fetch(
    new Request(quotaSettings.SITE_ORIGIN + '/api/ai/health'),
    fixture.env,
  );
  expect(await health.json()).toEqual({ enabled: true });
  expect(fixture.commands).toHaveLength(0);
  expect(
    (
      await fixture.send(
        post('192.0.2.1', { ...feedbackInput, model: 'foreign/model' }),
      )
    ).response.status,
  ).toBe(400);
  expect(fixture.storage.values.has('budget')).toBe(false);
  expect(fixture.transport).not.toHaveBeenCalled();
  expect(fixture.commands).toHaveLength(1);
});
test('foreign origin and unsupported method fail before touching quota storage', async () => {
  const fixture = setup();
  expect(
    (
      await fixture.send(
        post('192.0.2.1', feedbackInput, 'stream-feedback', {
          Origin: 'https://foreign.test',
        }),
      )
    ).response.status,
  ).toBe(403);
  expect(
    (
      await fixture.worker.fetch(
        new Request(quotaSettings.SITE_ORIGIN + '/api/ai/stream-feedback', {
          headers: { Origin: quotaSettings.SITE_ORIGIN },
        }),
        fixture.env,
      )
    ).status,
  ).toBe(405);
  expect(fixture.commands).toHaveLength(0);
});
for (const flag of ['false', '', 'TRUE', '1']) {
  test(`AI_ENABLED=${JSON.stringify(flag)} disables calls, quotas and health`, async () => {
    const fixture = setup();
    const env = { ...fixture.env, AI_ENABLED: flag };
    const response = await fixture.worker.fetch(post(), env);
    expect(await response.json()).toMatchObject({
      error: { code: 'ai-disabled' },
    });
    const health = await fixture.worker.fetch(
      new Request(quotaSettings.SITE_ORIGIN + '/api/ai/health'),
      env,
    );
    expect(await health.json()).toEqual({ enabled: false });
    expect(fixture.commands).toHaveLength(0);
    expect(fixture.transport).not.toHaveBeenCalled();
  });
}
for (const limit of [
  '',
  '0',
  '-1',
  '1.5',
  '01',
  '1e3',
  '1000001',
  '9007199254740992',
]) {
  test(`invalid global limit ${JSON.stringify(limit)} fails closed`, async () => {
    const fixture = setup(limit);
    const { response, body } = await fixture.send();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: 'configuration' },
    });
    expect(fixture.transport).not.toHaveBeenCalled();
    expect(fixture.commands).toHaveLength(0);
  });
}
test('missing namespace, short HMAC secret and invalid provider configuration fail closed', async () => {
  const fixture = setup();
  const { AI_QUOTA: removed, ...withoutNamespace } = fixture.env;
  expect(removed).toBeDefined();
  for (const env of [
    withoutNamespace,
    { ...fixture.env, AI_IP_HMAC_SECRET: 'short' },
    { ...fixture.env, OPENROUTER_API_KEY: '' },
    { ...fixture.env, AI_MODEL_PRIMARY: 'bad' },
  ]) {
    const response = await fixture.worker.fetch(post(), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'configuration' },
    });
  }
  expect(fixture.transport).not.toHaveBeenCalled();
});
for (const ip of [
  '',
  'unknown',
  '192.0.2.256',
  '192.000.2.1',
  '192.0.2.1, 192.0.2.2',
  'fe80::1%eth0',
]) {
  test(`invalid trusted IP ${JSON.stringify(ip)} cannot fall back to a spoofable header`, async () => {
    const fixture = setup();
    const { response } = await fixture.send(
      post(ip, feedbackInput, 'stream-feedback', {
        'X-Forwarded-For': '192.0.2.1',
      }),
    );
    expect(response.status).toBe(503);
    expect(fixture.commands).toHaveLength(0);
    expect(fixture.transport).not.toHaveBeenCalled();
  });
}
test('IPv6 spellings and IPv4-mapped addresses cannot multiply the rate allowance', async () => {
  for (const pair of [
    ['2001:0db8:0:0:0:0:0:1', '2001:db8::1'],
    ['192.0.2.1', '::ffff:192.0.2.1'],
  ]) {
    const fixture = setup();
    for (let i = 0; i < 10; i++) await fixture.send(post(pair[0]));
    expect((await fixture.send(post(pair[1]))).response.status).toBe(429);
  }
});
test('state contains only HMAC pseudonyms and counts; logs and provider contain no IP or quota secret', async () => {
  const fixture = setup();
  const logs = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'info'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
    vi.spyOn(console, 'debug'),
  ];
  await fixture.send(
    post('192.0.2.37', {
      ...feedbackInput,
      reasoning: 'private-student-reasoning',
    }),
  );
  for (let i = 0; i < 10; i++) await fixture.send(post('192.0.2.37'));
  fixture.env.AI_QUOTA.getByName = () => {
    throw new Error('192.0.2.37 private-student-reasoning');
  };
  const { body } = await fixture.send();
  const stored = JSON.stringify([...fixture.storage.values]);
  const internal = JSON.stringify(fixture.commands);
  const provider = JSON.stringify(fixture.transport.mock.calls);
  for (const text of [stored, internal, body]) {
    expect(text).not.toContain('192.0.2.37');
    expect(text).not.toContain('private-student-reasoning');
    expect(text).not.toContain(quotaSettings.AI_IP_HMAC_SECRET);
  }
  expect(provider).not.toContain('192.0.2.37');
  expect(provider).not.toContain(quotaSettings.AI_IP_HMAC_SECRET);
  expect(
    [...fixture.storage.values.keys()].filter((key) => key.startsWith('ip:')),
  ).toHaveLength(1);
  expect(
    [...fixture.storage.values.keys()].find((key) => key.startsWith('ip:')),
  ).toMatch(/^ip:[a-f0-9]{64}$/u);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
test('alarm removes expired pseudonyms without a later request from the client', async () => {
  const fixture = setup();
  const start = fixture.clock.now;
  await fixture.send();
  fixture.clock.now += 1000;
  await fixture.send(post('192.0.2.2'));
  expect(fixture.storage.alarm).toBe(start + day);
  fixture.clock.now = start + day;
  await fixture.object.alarm();
  expect(
    [...fixture.storage.values.keys()].filter((key) => key.startsWith('ip:')),
  ).toHaveLength(1);
  expect(fixture.storage.alarm).toBe(start + day + 1000);
  fixture.clock.now += 1000;
  await fixture.object.alarm();
  expect([...fixture.storage.values.keys()]).toEqual(['budget']);
  expect(fixture.storage.alarm).toBeNull();
});
test('alarm prunes expired visits within an active IP record and schedules the next expiry', async () => {
  const fixture = setup();
  const start = fixture.clock.now;
  await fixture.send();
  fixture.clock.now += 1000;
  await fixture.send();
  fixture.clock.now = start + day;
  await fixture.object.alarm();
  expect(
    [...fixture.storage.values].find(([key]) => key.startsWith('ip:'))?.[1],
  ).toEqual([start + 1000]);
  expect(fixture.storage.alarm).toBe(start + day + 1000);
});
test('corrupt state and backwards clock cannot reset budget or rate allowance', async () => {
  const fixture = setup();
  await fixture.send();
  fixture.storage.values.set('budget', {
    day: Math.floor(fixture.clock.now / day) + 1,
    count: 1,
  });
  expect((await fixture.send()).response.status).toBe(503);
  fixture.storage.values.set('budget', { day: 1, count: 'bad' });
  expect((await fixture.send()).response.status).toBe(503);
  fixture.storage.values.delete('budget');
  fixture.clock.now--;
  expect((await fixture.send()).response.status).toBe(503);
  expect(fixture.transport).toHaveBeenCalledTimes(1);
});
test('lowering or raising configured budget never resets consumed calls', async () => {
  const fixture = setup('2');
  await fixture.send();
  const low = new AiQuota(
    { storage: fixture.storage },
    { ...fixture.env, AI_DAILY_REQUEST_LIMIT: '1' },
    () => fixture.clock.now,
  );
  expect(await allow(low, { kind: 'budget' })).toMatchObject({
    value: { allowed: false, code: 'budget' },
  });
  const raised = new AiQuota(
    { storage: fixture.storage },
    { ...fixture.env, AI_DAILY_REQUEST_LIMIT: '3' },
    () => fixture.clock.now,
  );
  expect(await allow(raised, { kind: 'budget' })).toMatchObject({
    value: { allowed: true },
  });
  expect(fixture.storage.values.get('budget')).toMatchObject({ count: 2 });
});
for (const reply of [
  () => Promise.reject(new Error('private-storage-failure')),
  () => Promise.resolve(new Response(null, { status: 503 })),
  () =>
    Promise.resolve(
      Response.json({ allowed: true, unexpected: 'private-state' }),
    ),
  () => Promise.resolve(new Response('not-json')),
]) {
  test('unavailable or malformed limiter response blocks the provider safely', async () => {
    const fixture = setup();
    fixture.env.AI_QUOTA.getByName = () => ({ fetch: reply });
    const { response, body } = await fixture.send();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({ error: { code: 'limits' } });
    expect(body).not.toContain('private-');
    expect(fixture.transport).not.toHaveBeenCalled();
  });
}
test('cancellation during quota lookup prevents later provider fetch', async () => {
  const fixture = setup();
  let release: ((response: Response) => void) | undefined;
  fixture.env.AI_QUOTA.getByName = () => ({
    fetch: () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  });
  const controller = new AbortController();
  const pending = fixture.worker.fetch(
    new Request(post(), { signal: controller.signal }),
    fixture.env,
  );
  await vi.waitFor(() => {
    expect(release).toBeDefined();
  });
  controller.abort('private-cancel-reason');
  expect((await pending).status).toBe(499);
  release?.(Response.json({ allowed: true }));
  expect(fixture.transport).not.toHaveBeenCalled();
});
test('Durable Object rejects malformed commands and disabled configuration without state', async () => {
  const fixture = quotaFixture();
  for (const command of [
    { kind: 'rate', key: 'raw-ip' },
    { kind: 'budget', limit: 9000 },
    { kind: 'unknown' },
  ]) {
    const response = await fixture.object.fetch(
      new Request('https://quota.internal/allow', {
        method: 'POST',
        body: JSON.stringify(command),
      }),
    );
    expect(response.status).toBe(400);
  }
  const disabled = new AiQuota(
    { storage: fixture.storage },
    { ...fixture.env, AI_ENABLED: 'false' },
  );
  expect(
    (
      await disabled.fetch(
        new Request('https://quota.internal/allow', {
          method: 'POST',
          body: '{"kind":"budget"}',
        }),
      )
    ).status,
  ).toBe(503);
  expect(fixture.storage.values.size).toBe(0);
});

test('a stalled budget reservation stays within the transport deadline and cannot start a late fetch', async () => {
  vi.useFakeTimers();
  const fixture = setup();
  let release: ((response: Response) => void) | undefined;
  let started: (() => void) | undefined;
  const reserved = new Promise<void>((resolve) => {
    started = resolve;
  });
  fixture.env.AI_QUOTA.getByName = () => ({
    fetch(_url, init) {
      if (init.body === '{"kind":"budget"}') {
        started?.();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(Response.json({ allowed: true }));
    },
  });
  const pending = fixture.worker.fetch(post(), fixture.env);
  await reserved;
  await vi.advanceTimersByTimeAsync(30_000);
  const response = await pending;
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({ error: { code: 'timeout' } });
  const cancelled = vi.fn();
  release?.(
    new Response(new ReadableStream<Uint8Array>({ cancel: cancelled })),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(fixture.transport).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
