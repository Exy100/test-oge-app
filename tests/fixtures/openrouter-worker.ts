import { z } from '../../src/core/zod';
import { createOpenRouter, createWorker } from '../../worker/src/index';
import {
  routerEnv,
  providerStream,
  completion,
  officeGrade,
  providerPayload,
  delta,
} from './openrouter-data';

/** Private transport harness; the production Worker never imports this module. */
export default {
  async fetch(request: Request) {
    const scenario = new URL(request.url).searchParams.get('scenario');
    const cancellation = { aborted: 0, cancelled: 0 };
    let onCancelled: (() => void) | undefined;
    const cancelled = new Promise<void>((resolve) => {
      onCancelled = resolve;
    });
    const controller = new AbortController();
    let calls = 0;
    const transport: typeof fetch = (url, init) =>
      Promise.resolve().then(() => {
        calls++;
        const body = z
          .object({
            model: z.enum(['test/primary', 'test/fallback']),
            stream: z.boolean(),
            provider: z.object({ data_collection: z.literal('deny') }),
            max_tokens: z.union([
              z.literal(700),
              z.literal(500),
              z.literal(1200),
            ]),
          })
          .parse(providerPayload(init));
        if (
          url !== 'https://openrouter.ai/api/v1/chat/completions' ||
          new Headers(init?.headers).get('Authorization') !==
            'Bearer fixture-credential' ||
          body.model !== (calls === 1 ? 'test/primary' : 'test/fallback')
        )
          throw new Error('Не соблюдён контракт частного провайдера.');
        if (scenario === 'fallback' && calls === 1)
          return new Response(null, { status: 429 });
        if (scenario === 'invalid') return completion('private-invalid-json');
        if (scenario === 'cancel-body' || scenario === 'cancel-request') {
          init?.signal?.addEventListener(
            'abort',
            () => {
              cancellation.aborted++;
            },
            { once: true },
          );
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(delta('Начало')));
              },
              cancel() {
                cancellation.cancelled++;
                onCancelled?.();
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        return body.stream
          ? providerStream()
          : scenario === 'office'
            ? completion(officeGrade)
            : completion();
      });
    const response = await createWorker(
      createOpenRouter(routerEnv, transport),
    ).fetch(
      scenario === 'cancel-request'
        ? new Request(request, { signal: controller.signal })
        : request,
      routerEnv,
    );
    if (scenario === 'cancel-body' || scenario === 'cancel-request') {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Нет проверяемого потока.');
      const first = await reader.read();
      if (first.done) throw new Error('Поток завершился до отмены.');
      if (scenario === 'cancel-body') await reader.cancel();
      else {
        controller.abort('private-disconnect-reason');
        if (!(await reader.read()).done)
          throw new Error('После отмены получен лишний текст.');
      }
      reader.releaseLock();
      await cancelled;
      return Response.json(cancellation);
    }
    const headers = new Headers(response.headers);
    headers.set('X-Fixture-Calls', String(calls));
    return new Response(response.body, { status: response.status, headers });
  },
};
