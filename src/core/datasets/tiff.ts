/** Baseline little-endian TIFF: one uncompressed 8-bit grayscale strip, 72 dpi. */
const tags = [
  256, 257, 258, 259, 262, 273, 277, 278, 279, 282, 283, 296,
] as const;
const pixelOffset = 174;
export function makeTiff(
  width: number,
  height: number,
  pixels: Uint8Array,
): Uint8Array {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 512 ||
    height > 512 ||
    pixels.length !== width * height
  )
    throw new Error('Некорректный размер TIFF.');
  const bytes = new Uint8Array(pixelOffset + pixels.length),
    view = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]);
  view.setUint16(8, tags.length, true);
  const values = [
    width,
    height,
    8,
    1,
    1,
    pixelOffset,
    1,
    height,
    pixels.length,
    158,
    166,
    2,
  ];
  tags.forEach((tag, i) => {
    const position = 10 + i * 12,
      short = [258, 259, 262, 277, 296].includes(tag),
      rational = tag === 282 || tag === 283;
    view.setUint16(position, tag, true);
    view.setUint16(position + 2, rational ? 5 : short ? 3 : 4, true);
    view.setUint32(position + 4, 1, true);
    view.setUint32(position + 8, values[i] ?? 0, true);
  });
  for (const offset of [158, 166]) {
    view.setUint32(offset, 72, true);
    view.setUint32(offset + 4, 1, true);
  }
  bytes.set(pixels, pixelOffset);
  return bytes;
}
export function readTiff(bytes: Uint8Array): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  if (bytes.length < pixelOffset + 1 || bytes.length > 1_048_576)
    throw new Error('Некорректный TIFF.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    width = view.getUint32(18, true),
    height = view.getUint32(30, true);
  const pixels = bytes.subarray(pixelOffset),
    canonical = makeTiff(width, height, pixels);
  if (
    canonical.length !== bytes.length ||
    !canonical.every((byte, i) => byte === bytes[i])
  )
    throw new Error('TIFF не соответствует ограниченному профилю.');
  return { width, height, pixels };
}
