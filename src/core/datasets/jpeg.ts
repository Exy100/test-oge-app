import { originalJpegBase64 } from './original-jpeg-data.ts';
const originals = originalJpegBase64.map((base64) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
);
export function originalJpeg(index: number): Uint8Array {
  const bytes = originals[index];
  if (!Number.isInteger(index) || !bytes)
    throw new Error('Неизвестная авторская иллюстрация.');
  return bytes.slice();
}
/** This dataset accepts only the eight original illustrations, not arbitrary JPEG imports. */
export function validateOriginalJpeg(bytes: Uint8Array): void {
  if (
    !originals.some(
      (original) =>
        original.length === bytes.length &&
        original.every((byte, i) => byte === bytes[i]),
    )
  )
    throw new Error('JPEG не входит в набор авторских иллюстраций.');
}
