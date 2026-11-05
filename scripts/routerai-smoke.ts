import { createRouterAi } from '../worker/src/routerai';
import { routerAiFeedback } from '../tests/fixtures/routerai-data';
import {
  preparedProgram,
  preparedSummary,
} from '../tests/fixtures/openrouter-data';

export function routerAiProbeTransport(transport: typeof fetch) {
  const state = { calls: 0, statuses: [] as number[] };
  return {
    state,
    transport: (async (url, init) => {
      const address =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (
        state.calls >= 3 ||
        ![
          'https://routerai.ru/api/v1/chat/completions',
          'https://routerai.ru/api/v1/messages',
        ].includes(address)
      )
        throw new Error('Probe request limit');
      state.calls++;
      const response = await transport(url, init);
      state.statuses.push(response.status);
      return response;
    }) satisfies typeof fetch,
  };
}

/** Synthetic protocol probes only. Opus is probed explicitly, not via a fabricated upstream failure. */
export async function probeRouterAi(
  settings: Record<string, unknown>,
  apiKey: string,
  transport: typeof fetch,
) {
  const base: Record<string, unknown> = {
    ...settings,
    AI_MODEL_SIMPLE: 'openai/gpt-6-luna',
    AI_SIMPLE_TASK_NUMBERS: '1,2,3,4',
    AI_MODEL_PRIMARY: 'anthropic/claude-sonnet-5.5',
    AI_MODEL_FALLBACK: 'anthropic/claude-opus-5.5',
    ROUTERAI_API_KEY: apiKey,
  };
  const cases = [
    {
      mode: 'simple-feedback',
      env: base,
      request: routerAiFeedback(1).prepared,
    },
    { mode: 'preliminary-grade', env: base, request: preparedProgram },
    {
      mode: 'opus-summary-probe',
      env: {
        ...base,
        AI_MODEL_PRIMARY: base['AI_MODEL_FALLBACK'],
        AI_MODEL_FALLBACK: base['AI_MODEL_PRIMARY'],
      },
      request: preparedSummary,
    },
  ];
  const results: { mode: string; protocol: 'json' | 'sse'; passed: true }[] =
    [];
  for (const item of cases) {
    const response = await createRouterAi(item.env, transport).respond(
      item.request,
      new AbortController().signal,
    );
    if (item.request.mode === 'part2-grade') {
      // The real client has already validated the strict grade schema and task maximum.
      await response.json();
    } else {
      const text = await response.text();
      if (!text.endsWith('data: [DONE]\n\n'))
        throw new Error('Incomplete provider stream');
    }
    results.push({
      mode: item.mode,
      protocol: item.request.mode === 'part2-grade' ? 'json' : 'sse',
      passed: true,
    });
  }
  return results;
}
