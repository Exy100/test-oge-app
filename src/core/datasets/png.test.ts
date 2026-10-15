import { expect, test } from 'vitest';
import { makePng, readPng } from './png';
import { crc32 } from './zip';
test('RGBA PNG round-trip preserves exact pixels, including alpha', () => {
  const pixels = new Uint8Array([1, 2, 3, 255, 250, 240, 230, 0]);
  expect(readPng(makePng(2, 1, pixels))).toEqual({
    width: 2,
    height: 1,
    pixels,
  });
});
test('rejects unsupported dimensions, corrupted chunks and trailing bytes', () => {
  expect(() => makePng(513, 1, new Uint8Array())).toThrow();
  expect(() => makePng(2, 1, new Uint8Array(4))).toThrow();
  const png = makePng(1, 1, new Uint8Array(4));
  for (const bytes of [
    new Uint8Array(),
    png.slice(0, -1),
    new Uint8Array([...png, 0]),
    png.map((value, i) => (i === 40 ? value ^ 1 : value)),
  ])
    expect(() => readPng(bytes)).toThrow();
  const dimensions = png.slice();
  const view = new DataView(dimensions.buffer);
  view.setUint32(16, 513);
  view.setUint32(29, crc32(dimensions.subarray(12, 29)));
  expect(() => readPng(dimensions)).toThrow('Неподдерживаемый');
});

test('rejects decompressed rows beyond the declared image dimensions', () => {
  const oversized = makePng(1, 2, new Uint8Array(8));
  const view = new DataView(oversized.buffer);
  view.setUint32(20, 1);
  view.setUint32(29, crc32(oversized.subarray(12, 29)));
  expect(() => readPng(oversized)).toThrow('Размер пикселей');
});
