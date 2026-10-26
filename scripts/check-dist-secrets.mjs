import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Scan bytes as well as text; never include a matched value in the error. */
export async function checkDistSecrets(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  let files = 0;
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const name = relative(root, path);
    if (entry.isSymbolicLink())
      throw new Error(`Символическая ссылка в публичной сборке: ${name}`);
    if (entry.name.toLowerCase().startsWith('.env'))
      throw new Error(`Файл окружения в публичной сборке: ${name}`);
    if (!entry.isFile()) continue;
    const bytes = await readFile(path);
    if (
      bytes.includes(Buffer.from('sk-or-')) ||
      /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u.test(bytes.toString('latin1'))
    )
      throw new Error(`Признак секрета в публичной сборке: ${name}`);
    files++;
  }
  if (!files) throw new Error('Публичная сборка пуста.');
  return files;
}

if (import.meta.main) {
  const files = await checkDistSecrets(new URL('../dist/', import.meta.url));
  console.info(`Dist security: ${String(files)} files; no secret markers.`);
}
