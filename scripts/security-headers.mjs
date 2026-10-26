import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const requiredSources = {
  'default-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
};

function validatePolicy(policy, html, file) {
  const directives = new Map();
  for (const part of policy.split(';').map((value) => value.trim())) {
    if (!part) continue;
    const [name, ...sources] = part.split(/\s+/u);
    if (directives.has(name))
      throw new Error(`Повтор директивы CSP ${name}: ${file}`);
    directives.set(name, sources);
  }
  const names = [...Object.keys(requiredSources), 'script-src', 'style-src'];
  if (
    directives.size !== names.length ||
    names.some((name) => !directives.has(name))
  )
    throw new Error(`Неполный или неожиданный набор директив CSP: ${file}`);
  for (const [name, required] of Object.entries(requiredSources)) {
    const sources = directives.get(name);
    if (
      sources.length !== required.length ||
      required.some((source) => !sources.includes(source))
    )
      throw new Error(`Небезопасная директива CSP ${name}: ${file}`);
  }
  for (const name of ['script-src', 'style-src']) {
    const sources = directives.get(name);
    if (
      !sources.includes("'self'") ||
      sources.some(
        (source) =>
          source !== "'self'" && !/^'sha256-[A-Za-z0-9+/]{43}='$/u.test(source),
      )
    )
      throw new Error(`Небезопасный источник CSP ${name}: ${file}`);
  }
  for (const match of html.matchAll(
    /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/giu,
  )) {
    const [, kind, attributes, content] = match;
    if (kind.toLowerCase() === 'script' && /(?:^|\s)src\s*=/iu.test(attributes))
      continue;
    const hash = `'sha256-${createHash('sha256').update(content).digest('base64')}'`;
    if (!directives.get(`${kind.toLowerCase()}-src`).includes(hash))
      throw new Error(`Нет CSP-хэша встроенного ${kind}: ${file}`);
  }
  return directives;
}

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
    const directives = validatePolicy(policy, html, file);
    const charset = html.match(/<meta charset="UTF-8"\s*\/?\s*>/u)?.[0];
    if (!charset) throw new Error(`Не найдена кодировка HTML: ${file}`);
    await writeFile(
      join(root, file),
      html.replace(metas[0], '').replace(charset, `${charset}${metas[0]}`),
    );
    for (const [directive, values] of Object.entries(resources)) {
      for (const source of directives.get(directive)) values.add(source);
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
