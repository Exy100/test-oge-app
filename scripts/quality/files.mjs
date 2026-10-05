import { readdir, lstat, realpath } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';

export async function ensureInsideRoot(root, path) {
  const [actualRoot, actualPath] = await Promise.all([
    realpath(root),
    realpath(join(root, path)),
  ]);
  if (actualPath !== actualRoot && !actualPath.startsWith(actualRoot + sep))
    throw new Error(`Путь выходит за пределы проекта: ${path}`);
}

/** Missing future source directories are empty; all other I/O failures propagate. */
export async function filesIn(root, directory) {
  let entries;
  try {
    const stat = await lstat(join(root, directory));
    if (stat.isSymbolicLink())
      throw new Error(`Символическая ссылка в исходниках: ${directory}`);
    await ensureInsideRoot(root, directory);
    entries = await readdir(join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const path = posix.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Символическая ссылка в исходниках: ${path}`);
    if (entry.isDirectory()) files.push(...(await filesIn(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

export function formatDiagnostic(item) {
  return `${item.file}:${item.line}: ${item.rule}: ${item.message}`;
}
