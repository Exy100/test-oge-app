import type { APIRoute } from 'astro';
import {
  codingSources,
  codingArchiveKey,
} from '../../../../lib/lessons/coding';
import { resolveStreamTask } from '../../../../core/stream/catalog';
import { createTaskDataset } from '../../../../core/generators/task-dataset';
import type { StreamReference } from '../../../../core/stream/schemas';
export function getStaticPaths() {
  return codingSources.map((source) => ({
    params: { dataset: codingArchiveKey(source) },
    props: { source },
  }));
}
export const GET: APIRoute = async ({ props }) => {
  const source = props.source as StreamReference;
  const dataset = await createTaskDataset(resolveStreamTask(source));
  return new Response(Uint8Array.from(dataset.archive), {
    headers: { 'Content-Type': 'application/zip' },
  });
};
