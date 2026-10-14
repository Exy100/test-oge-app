import { taskSources } from '../../src/core/generators/dataset-sources';
import { generators } from '../../src/core/generators/index';

export default {
  async fetch(request: Request): Promise<Response> {
    const seeds = (await request.json()) as string[];
    return Response.json(
      generators.map((generator) =>
        seeds.map((seed) => {
          const task = generator.generate(seed);
          return {
            task,
            verified: generator.verify(task),
            files:
              taskSources(task.subtype, seed)?.files.map(({ path, bytes }) => [
                path,
                Array.from(bytes),
              ]) ?? [],
          };
        }),
      ),
    );
  },
};
