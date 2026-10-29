import { z } from '../../src/core/zod';
import { prepareRequests } from '../../worker/src/prepare-request';
import { buildPrompt } from '../../worker/src/prompts';

/** Private message inspection harness, never a production entry or HTTP route. */
export default {
  async fetch(request: Request): Promise<Response> {
    const inputs = z
      .array(
        z.strictObject({
          path: z.enum([
            '/api/ai/stream-feedback',
            '/api/ai/part2-grade',
            '/api/ai/variant-summary',
          ]),
          body: z.unknown(),
        }),
      )
      .max(64)
      .parse(await request.json());
    return Response.json(
      inputs.map(({ path, body }) => buildPrompt(prepareRequests[path](body))),
    );
  },
};
