import { trainingFiles } from '../../../lib/interactives/training-files';
import { packZip } from '../../../core/datasets/zip';
export function GET() {
  const bytes = packZip(
    new Map(
      trainingFiles.map(({ path, text }) => [
        path,
        new TextEncoder().encode(text),
      ]),
    ),
  );
  return new Response(Uint8Array.from(bytes), {
    headers: { 'Content-Type': 'application/zip' },
  });
}
