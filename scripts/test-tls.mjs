import { existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = new URL('../.cache/test-tls/', import.meta.url);
const key = new URL('key.pem', directory);
const cert = new URL('cert.pem', directory);
const fresh =
  existsSync(key) &&
  existsSync(cert) &&
  Date.now() - statSync(cert).mtimeMs < 12 * 60 * 60 * 1000;
if (!fresh) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      fileURLToPath(key),
      '-out',
      fileURLToPath(cert),
      '-days',
      '2',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'pipe' },
  );
}
