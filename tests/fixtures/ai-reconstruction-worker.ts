import { z } from '../../src/core/zod';
import { feedbackRequestSchema } from '../../src/lib/ai/contract';
import { prepareFeedback } from '../../worker/src/prepare-request';

/** Private parity harness; this module is never a production Worker entry. */
export default {
  async fetch(request: Request): Promise<Response> {
    const body: unknown = await request.json();
    const inputs = z.array(feedbackRequestSchema).length(200).parse(body);
    return Response.json(inputs.map(prepareFeedback));
  },
};
