import { zipSync } from 'fflate';
import { RelativePathSchema } from '../schemas/shared';

export const limits = Object.freeze({
  file: 1_048_576,
  total: 8_388_608,
  archive: 10_485_760,
  entries: 100,
});
export type Files = ReadonlyMap<string, Uint8Array>;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function safePath(path: string): string {
  RelativePathSchema.parse(path);
  if (
    encoder.encode(path).length > 240 ||
    path !== path.normalize('NFC') ||
    /[<>"|*]/u.test(path) ||
    path
      .split('/')
      .some(
        (part) =>
          /[. ]$/u.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part),
      )
  )
    throw new Error('Непереносимый путь файла.');
  return path;
}
export function validateFiles(files: Files): void {
  if (!files.size || files.size > limits.entries)
    throw new Error('Превышен лимит числа файлов.');
  const paths = new Set<string>();
  let total = 0;
  for (const [path, bytes] of files) {
    safePath(path);
    const key = path.toLowerCase();
    if (paths.has(key)) throw new Error('Повтор пути файла.');
    paths.add(key);
    if (bytes.byteLength > limits.file)
      throw new Error('Превышен размер файла.');
    total += bytes.byteLength;
  }
  if (total > limits.total) throw new Error('Превышен общий размер файлов.');
  for (const path of paths) {
    const parts = path.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (paths.has(parts.join('/')))
        throw new Error('Файл совпадает с каталогом.');
    }
  }
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function packZip(files: Files, first?: string): Uint8Array {
  validateFiles(files);
  if (first !== undefined && !files.has(first))
    throw new Error('Первый файл отсутствует.');
  const paths = [...files.keys()].sort();
  if (first !== undefined) {
    paths.splice(paths.indexOf(first), 1);
    paths.unshift(first);
  }
  const entries = Object.fromEntries(
    paths.map((path) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error('Файл отсутствует.');
      return [path, bytes];
    }),
  );
  const bytes = zipSync(entries, {
    level: 0,
    mtime: new Date(1980, 0, 1, 0, 0, 0),
    os: 0,
  });
  if (bytes.byteLength > limits.archive)
    throw new Error('Превышен размер ZIP.');
  return bytes;
}

/** Strict bounded reader for the stored ZIP profile emitted by packZip. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.byteLength < 22 || bytes.byteLength > limits.archive)
    throw new Error('Недопустимый размер ZIP.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  if (
    view.getUint32(end, true) !== 0x06054b50 ||
    view.getUint16(end + 20, true) !== 0 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    throw new Error('Неподдерживаемый ZIP.');
  const count = view.getUint16(end + 10, true);
  let central = view.getUint32(end + 16, true);
  const centralStart = central;
  if (
    !count ||
    count > limits.entries ||
    view.getUint16(end + 8, true) !== count ||
    central + view.getUint32(end + 12, true) !== end
  )
    throw new Error('Повреждён каталог ZIP.');
  const result = new Map<string, Uint8Array>();
  let localEnd = 0;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (central + 46 > end || view.getUint32(central, true) !== 0x02014b50)
      throw new Error('Повреждена запись ZIP.');
    const flags = view.getUint16(central + 8, true);
    const size = view.getUint32(central + 24, true);
    const nameLength = view.getUint16(central + 28, true);
    const extraLength = view.getUint16(central + 30, true);
    const commentLength = view.getUint16(central + 32, true);
    const offset = view.getUint32(central + 42, true);
    total += size;
    if (
      size > limits.file ||
      total > limits.total ||
      flags & ~0x0800 ||
      view.getUint16(central + 10, true) !== 0 ||
      view.getUint32(central + 20, true) !== size ||
      extraLength ||
      commentLength ||
      view.getUint16(central + 34, true) !== 0 ||
      view.getUint32(central + 38, true) !== 0
    )
      throw new Error('ZIP выходит за безопасный профиль.');
    if (
      central + 46 + nameLength > end ||
      offset !== localEnd ||
      offset + 30 > centralStart ||
      view.getUint32(offset, true) !== 0x04034b50
    )
      throw new Error('Повреждён заголовок ZIP.');
    const path = decoder.decode(
      bytes.subarray(central + 46, central + 46 + nameLength),
    );
    safePath(path);
    const localNameLength = view.getUint16(offset + 26, true);
    const localExtraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLength + localExtraLength;
    if (
      localExtraLength ||
      localNameLength !== nameLength ||
      start + size > centralStart ||
      view.getUint16(offset + 6, true) !== flags ||
      view.getUint16(offset + 8, true) !== 0 ||
      view.getUint32(offset + 18, true) !== size ||
      view.getUint32(offset + 22, true) !== size ||
      decoder.decode(bytes.subarray(offset + 30, start)) !== path
    )
      throw new Error('Заголовки ZIP не совпадают.');
    const data = bytes.subarray(start, start + size);
    const crc = crc32(data);
    if (
      view.getUint32(central + 16, true) !== crc ||
      view.getUint32(offset + 14, true) !== crc ||
      result.has(path)
    )
      throw new Error('CRC или уникальность ZIP нарушены.');
    result.set(path, data.slice());
    localEnd = start + size;
    central += 46 + nameLength;
  }
  if (central !== end || localEnd !== centralStart)
    throw new Error('Лишние данные в ZIP.');
  validateFiles(result);
  return result;
}
