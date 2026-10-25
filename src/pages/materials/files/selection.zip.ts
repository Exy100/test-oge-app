import { fileTreeSources } from '../../../core/generators/exam/file-tree';
import { packZip } from '../../../core/datasets/zip';
export function GET() {
  return new Response(
    Uint8Array.from(
      packZip(
        new Map(fileTreeSources().map(({ path, bytes }) => [path, bytes])),
      ),
    ),
    { headers: { 'Content-Type': 'application/zip' } },
  );
}
