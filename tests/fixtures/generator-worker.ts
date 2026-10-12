import { generators } from '../../src/core/generators/index';

export default {
  async fetch(request: Request): Promise<Response> {
    const seeds = (await request.json()) as string[];
    return Response.json(
      generators.map((generator) =>
        seeds.map((seed) => {
          const task = generator.generate(seed);
          return { task, verified: generator.verify(task) };
        }),
      ),
    );
  },
};
