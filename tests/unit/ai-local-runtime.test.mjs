import { nativeStreamResponse } from '../fixtures/anthropic-data';
import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiLocalWorker } from '../../scripts/ai-local-runtime.mjs';
import {
  feedbackInput,
  programInput,
  officeInput,
  summaryInput,
  programGrade,
  officeGrade,
  completedStream,
} from '../fixtures/openrouter-data';

test('production native Workers fetch reaches the Node egress bridge for all modes, fallback and a refused redirect', async () => {
  const persistencePath = await mkdtemp(join(tmpdir(), 'oge-native-ai-'));
  const calls = [];
  let scenario = 'normal';
  const local = await createAiLocalWorker({
    port: 0,
    persistencePath,
    bindings: {
      SITE_ORIGIN: 'https://local.example',
      AI_PROVIDER: 'routerai',
      AI_ENABLED: 'true',
      AI_DAILY_REQUEST_LIMIT: '30',
      ROUTERAI_API_KEY: 'fixture-native-credential',
      AI_IP_HMAC_SECRET: 'synthetic-native-edge-fixture-32-characters',
    },
    async transport(url, init) {
      const payload = JSON.parse(await new Response(init.body).text());
      calls.push({
        url,
        redirect: init.redirect,
        authorization:
          new Headers(init.headers).get('Authorization') ??
          new Headers(init.headers).get('x-api-key'),
        payload,
      });
      if (scenario === 'redirect')
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://untrusted.invalid/' },
        });
      if (scenario === 'fallback' && payload.model === 'openai/gpt-6-luna')
        return new Response(null, { status: 429 });
      if (url.endsWith('/messages')) return nativeStreamResponse();
      if (payload.stream)
        return new Response(completedStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      const grade = payload.messages
        .at(-1)
        .content.includes('Проверил оформление.')
        ? officeGrade
        : programGrade;
      return Response.json({
        choices: [
          {
            message: { content: JSON.stringify(grade) },
            finish_reason: 'stop',
          },
        ],
      });
    },
  });
  async function send(mode, data) {
    return fetch(`http://127.0.0.1:${local.port}/api/ai/${mode}`, {
      method: 'POST',
      headers: {
        Origin: 'https://local.example',
        'X-AI-Provider': 'routerai',
        'CF-Connecting-IP': '192.0.2.42',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }
  try {
    for (const [mode, data, grade] of [
      ['stream-feedback', feedbackInput, null],
      ['variant-summary', summaryInput, null],
      ['part2-grade', programInput, programGrade],
      ['part2-grade', officeInput, officeGrade],
    ]) {
      const response = await send(mode, data);
      expect(response.status).toBe(200);
      if (grade) expect(await response.json()).toEqual(grade);
      else expect(await response.text()).toContain('data: [DONE]');
    }
    scenario = 'fallback';
    const fallback = await send('stream-feedback', feedbackInput);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain('data: [DONE]');
    expect(calls.slice(-2).map((call) => call.payload.model)).toEqual([
      'openai/gpt-6-luna',
      'anthropic/claude-sonnet-5.5',
    ]);
    scenario = 'redirect';
    const before = calls.length;
    const redirect = await send('stream-feedback', feedbackInput);
    expect(redirect.status).toBe(503);
    expect(await redirect.json()).toMatchObject({
      error: { code: 'upstream' },
    });
    expect(calls.length).toBe(before + 1);
    expect(
      calls.every(
        (call) =>
          [
            'https://routerai.ru/api/v1/chat/completions',
            'https://routerai.ru/api/v1/messages',
          ].includes(call.url) &&
          call.redirect === 'error' &&
          call.authorization ===
            (call.url.endsWith('/messages')
              ? 'fixture-native-credential'
              : 'Bearer fixture-native-credential'),
      ),
    ).toBe(true);
  } finally {
    await local.stop();
    await rm(persistencePath, { recursive: true, force: true });
  }
}, 20000);
