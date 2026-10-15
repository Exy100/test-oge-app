import { streamProbe } from './stream-probe';

export default {
  async fetch(request: Request): Promise<Response> {
    const seeds = (await request.json()) as string[];
    return Response.json(seeds.map(streamProbe));
  },
};
