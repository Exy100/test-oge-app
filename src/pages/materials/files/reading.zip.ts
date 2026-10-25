import { readingSources } from '../../../core/generators/exam/reading-corpus';
import { packZip } from '../../../core/datasets/zip';
export function GET() {
  return new Response(
    Uint8Array.from(
      packZip(
        new Map(readingSources().map(({ path, bytes }) => [path, bytes])),
      ),
    ),
    { headers: { 'Content-Type': 'application/zip' } },
  );
}
