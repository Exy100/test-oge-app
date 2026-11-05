import { nativeStreamResponse, nativeCompletion } from './anthropic-data';
import { programGrade } from './openrouter-data';
import { z } from '../../src/core/zod';
import { createConfiguredWorker } from '../../worker/src/index';
import type { AccessEnv } from '../../worker/src/access';
import { providerPayload, providerStream, completion } from './openrouter-data';

export { AiQuota } from '../../worker/src/quota-object';

/** Private edge/provider harness; never imported by the production entrypoint. */
export default {
  async fetch(request: Request, env: AccessEnv & { SITE_ORIGIN: string }) {
    let calls = 0;
    const models: string[] = [];
    const fallback = request.headers.get('X-Fixture-Fallback') === 'true';
    const transport: typeof fetch = (url, init) => {
      const expected =
        env.AI_PROVIDER === 'routerai'
          ? 'https://routerai.ru/api/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
      const native =
        env.AI_PROVIDER === 'routerai' &&
        url === 'https://routerai.ru/api/v1/messages';
      if (url !== expected && !native)
        throw new Error('Unexpected provider destination');
      calls++;
      const payload = z
        .object({ stream: z.boolean(), model: z.string() })
        .parse(providerPayload(init));
      models.push(payload.model);
      if (fallback && calls === 1)
        return Promise.resolve(new Response(null, { status: 429 }));
      return Promise.resolve(
        native
          ? payload.stream
            ? nativeStreamResponse()
            : nativeCompletion(programGrade)
          : payload.stream
            ? providerStream()
            : completion(),
      );
    };
    const headers = new Headers(request.headers);
    // dispatchFetch is a local bridge; the fixture explicitly supplies trusted edge metadata.
    headers.set('CF-Connecting-IP', headers.get('X-Fixture-IP') ?? '192.0.2.1');
    const response = await createConfiguredWorker(transport).fetch(
      new Request(request, { headers }),
      request.headers.get('X-Fixture-Disabled') === 'true'
        ? { ...env, AI_ENABLED: 'false' }
        : env,
    );
    const outgoing = new Headers(response.headers);
    outgoing.set('X-Fixture-Calls', String(calls));
    outgoing.set('X-Fixture-Models', models.join(','));
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  },
};
