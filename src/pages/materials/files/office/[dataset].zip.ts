import type { APIRoute } from 'astro';
import {
  officeSources,
  officeArchiveKey,
} from '../../../../lib/lessons/office';
import { resolveStreamTask } from '../../../../core/stream/catalog';
import { createTaskDataset } from '../../../../core/generators/task-dataset';
import type { StreamReference } from '../../../../core/stream/schemas';
export function getStaticPaths() {
  return officeSources.map((source) => ({
    params: { dataset: officeArchiveKey(source) },
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
