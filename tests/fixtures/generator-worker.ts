import {
  isSelectionKind,
  selectionSources,
} from '../../src/core/generators/12/select-files';
import {
  isSearchKind,
  searchSources,
} from '../../src/core/generators/11/search-files';
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
            files: isSearchKind(task.subtype)
              ? [...searchSources(task.subtype, seed).files].map(
                  ([path, bytes]) => [path, Array.from(bytes)],
                )
              : isSelectionKind(task.subtype)
                ? [...selectionSources(task.subtype, seed).files].map(
                    ([path, bytes]) => [path, Array.from(bytes)],
                  )
                : [],
          };
        }),
      ),
    );
  },
};
