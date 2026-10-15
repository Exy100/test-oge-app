import { crc32 as nativeCrc32 } from 'node:zlib';
import { expect, test } from 'vitest';
import fc from 'fast-check';
import { crc32 } from './zip';

test('ZIP CRC matches standard vectors and the native implementation', () => {
  expect(crc32(new Uint8Array())).toBe(0);
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  const allBytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  expect(crc32(allBytes)).toBe(nativeCrc32(allBytes));
  const large = Uint8Array.from(
    { length: 1_048_576 },
    (_, index) => index & 255,
  );
  expect(crc32(large)).toBe(nativeCrc32(large));
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 8192 }), (bytes) => {
      expect(crc32(bytes)).toBe(nativeCrc32(bytes));
    }),
    { numRuns: 500 },
  );
});
