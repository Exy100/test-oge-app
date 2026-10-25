import type { APIRoute } from 'astro';
import { illustrate } from '../../../core/banks/illustrations';
import { getPresentationSet } from '../../../core/banks';
import { officeExamples } from '../../../lib/lessons/office';
export function getStaticPaths() {
  return officeExamples.presentations.flatMap((source) =>
    [0, 1, 2].map((index) => ({
      params: { asset: source.seed + '-' + String(index + 1) },
      props: { seed: source.seed, index },
    })),
  );
}
export const GET: APIRoute = ({ props }) => {
  const seed = String(props.seed),
    index = Number(props.index);
  return new Response(
    Uint8Array.from(illustrate(getPresentationSet(seed).scene, index)),
    { headers: { 'Content-Type': 'image/png' } },
  );
};
