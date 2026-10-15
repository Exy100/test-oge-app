import { zlibSync, Unzlib } from 'fflate';
import { crc32 } from './zip';
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
function join(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function chunk(type: string, bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, bytes.length);
  result.set(encoder.encode(type), 4);
  result.set(bytes, 8);
  view.setUint32(bytes.length + 8, crc32(result.subarray(4, bytes.length + 8)));
  return result;
}
export function makePng(
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
    pixels.length !== width * height * 4
  )
    throw new Error('Недопустимый размер PNG.');
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rows.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  return join([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(rows, { level: 6 })),
    chunk('IEND', new Uint8Array()),
  ]);
}
/** Bounded RGBA PNG profile used for original educational diagrams. */
export function readPng(bytes: Uint8Array): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  if (
    bytes.length < 57 ||
    bytes.length > 1_048_576 ||
    !signature.every((byte, i) => bytes[i] === byte)
  )
    throw new Error('Недопустимый PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const chunks: Uint8Array[] = [];
  let offset = 8;
  for (const expected of ['IHDR', 'IDAT', 'IEND']) {
    if (offset + 12 > bytes.length) throw new Error('Обрезанный PNG.');
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (
      end > bytes.length ||
      new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)) !==
        expected ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
    )
      throw new Error('Состав или CRC PNG не совпадает.');
    chunks.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  const [header, compressed, end] = chunks;
  if (
    !header ||
    !compressed ||
    !end ||
    header.length !== 13 ||
    end.length ||
    offset !== bytes.length
  )
    throw new Error('Неверный состав PNG.');
  const dimensions = new DataView(
    header.buffer,
    header.byteOffset,
    header.length,
  );
  const width = dimensions.getUint32(0),
    height = dimensions.getUint32(4);
  if (
    !width ||
    !height ||
    width > 512 ||
    height > 512 ||
    header[8] !== 8 ||
    header[9] !== 6 ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0
  )
    throw new Error('Неподдерживаемый PNG.');
  const stride = width * 4 + 1;
  const rows = new Uint8Array(height * stride);
  let written = 0;
  const inflate = new Unzlib((data) => {
    if (written + data.length > rows.length)
      throw new Error('Размер пикселей PNG не совпадает.');
    rows.set(data, written);
    written += data.length;
  });
  for (let position = 0; position < compressed.length; position += 1024) {
    inflate.push(
      compressed.subarray(position, position + 1024),
      position + 1024 >= compressed.length,
    );
  }
  if (written !== rows.length)
    throw new Error('Размер пикселей PNG не совпадает.');
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (rows[y * stride] !== 0) throw new Error('Неподдерживаемый фильтр PNG.');
    pixels.set(rows.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
  }
  return { width, height, pixels };
}
