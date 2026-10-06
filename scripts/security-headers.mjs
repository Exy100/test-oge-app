import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function writeSecurityHeaders(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const files = (await readdir(root, { recursive: true })).filter((file) =>
    file.endsWith('.html'),
  );
  if (!files.length) throw new Error('Нет HTML для проверки CSP.');
  const resources = {
    'script-src': new Set(["'self'"]),
    'style-src': new Set(["'self'"]),
  };
  for (const file of files) {
    const html = await readFile(join(root, file), 'utf8');
    const metas = html.match(
      /<meta\b[^>]*http-equiv="content-security-policy"[^>]*>/giu,
    );
    if (metas?.length !== 1) throw new Error(`Нет единственной CSP: ${file}`);
    const policy = metas[0].match(/\bcontent="([^"]+)"/u)?.[1];
    if (!policy || /unsafe-inline|unsafe-eval/u.test(policy))
      throw new Error(`Небезопасная CSP: ${file}`);
    const charset = html.match(/<meta charset="UTF-8"\s*\/?\s*>/u)?.[0];
    if (!charset) throw new Error(`Не найдена кодировка HTML: ${file}`);
    await writeFile(
      join(root, file),
      html.replace(metas[0], '').replace(charset, `${charset}${metas[0]}`),
    );
    for (const [directive, values] of Object.entries(resources)) {
      const value = policy
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${directive} `));
      if (!value) throw new Error(`Нет ${directive}: ${file}`);
      for (const source of value.split(/\s+/u).slice(1)) {
        if (!/^'(?:self|sha256-[A-Za-z0-9+/]+=*)'$/u.test(source))
          throw new Error(`Неожиданный источник ${directive}: ${file}`);
        values.add(source);
      }
    }
  }
  const target = join(root, '_headers');
  let headers = await readFile(target, 'utf8');
  for (const [directive, values] of Object.entries(resources)) {
    if (!headers.includes(`${directive} 'self';`))
      throw new Error(`Нет шаблона ${directive} в _headers.`);
    headers = headers.replace(
      `${directive} 'self';`,
      `${directive} ${[...values].sort().join(' ')};`,
    );
  }
  if (headers.split('\n').some((line) => Buffer.byteLength(line) > 2000))
    throw new Error(
      'CSP превышает лимит строки _headers; нужны правила по маршрутам.',
    );
  await writeFile(target, headers);
}
