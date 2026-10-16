import {
  isSelectionKind,
  selectionSources,
} from '../../src/core/generators/12/select-files';
import {
  isSearchKind,
  searchSources,
} from '../../src/core/generators/11/search-files';
import { generators } from '../../src/core/generators/index';
import { confirmedShortGenerators } from '../../src/core/generators/exam/short-generators';
import { confirmedFileGenerators } from '../../src/core/generators/exam/file-generators';
import { createTaskDataset } from '../../src/core/generators/task-dataset';
import { sha256 } from '../../src/core/datasets';
import {
  buildVariant,
  buildFixedVariant,
  fixedVariants,
} from '../../src/core/variants';

export default {
  async fetch(request: Request): Promise<Response> {
    const seeds = (await request.json()) as string[];
    if (new URL(request.url).pathname === '/confirmed-exam')
      return Response.json(
        await Promise.all(
          [...confirmedShortGenerators, ...confirmedFileGenerators].map(
            (generator) =>
              Promise.all(
                seeds.map(async (seed) => {
                  const task = generator.generate(seed),
                    dataset = task.datasetId
                      ? await createTaskDataset(task)
                      : undefined;
                  return {
                    task,
                    verified: generator.verify(task),
                    ...(dataset
                      ? {
                          manifest: dataset.manifest,
                          archiveSha256: await sha256(dataset.archive),
                        }
                      : {}),
                  };
                }),
              ),
          ),
        ),
      );
    if (new URL(request.url).pathname === '/variants')
      return Response.json({
        fixed: fixedVariants.map((item) => ({
          presentation: buildFixedVariant(item.id),
          document: buildFixedVariant(item.id, 'document'),
        })),
        generated: seeds.map((seed) => ({
          presentation: buildVariant(seed),
          document: buildVariant(seed, 'document'),
        })),
      });
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
