import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const script = fileURLToPath(
  new URL('../../scripts/ci-apt-mirror.sh', import.meta.url),
);
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ubuntu-mirror-'));
  directories.push(directory);
  const log = join(directory, 'requests');
  writeFileSync(
    join(directory, 'curl'),
    `#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == https://* ]]; then url="$arg"; fi
done
printf '%s\\n' "$url" >> "$MIRROR_LOG"
[[ "\${ALL_MIRRORS_DOWN:-}" != 1 && "$url" == https://mirrors.edge.kernel.org/* ]]
`,
    { mode: 0o755 },
  );
  writeFileSync(join(directory, 'sudo'), '#!/usr/bin/env bash\nexec "$@"\n', {
    mode: 0o755,
  });
  return {
    directory,
    log,
    env: {
      ...process.env,
      PATH: directory + ':' + process.env.PATH,
      MIRROR_LOG: log,
    },
  };
}

test('an unreachable primary falls back only after checking every required suite', () => {
  const { env, log } = fixture();
  const output = execFileSync(
    'bash',
    ['-c', 'source "$1"; select_mirror noble', 'test', script],
    { env, encoding: 'utf8' },
  );
  expect(output.trim()).toBe('https://mirrors.edge.kernel.org/ubuntu');
  const requests = readFileSync(log, 'utf8').trim().split('\n');
  expect(requests[0]).toBe(
    'https://archive.ubuntu.com/ubuntu/dists/noble/InRelease',
  );
  expect(requests.slice(1).map((url) => url.split('/').at(-2))).toEqual([
    'noble',
    'noble-updates',
    'noble-backports',
    'noble-security',
  ]);
});

test('a complete mirror outage fails instead of silently proceeding', () => {
  const { env } = fixture();
  const result = spawnSync(
    'bash',
    ['-c', 'source "$1"; select_mirror noble', 'test', script],
    { env: { ...env, ALL_MIRRORS_DOWN: '1' }, encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('No reachable Ubuntu mirror');
});

test('rewriting archive and security URLs preserves suites, components and signing keys', () => {
  const { directory, env } = fixture();
  const source = join(directory, 'ubuntu.sources');
  const original =
    'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu https://security.ubuntu.com/ubuntu\nSuites: noble noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
  writeFileSync(source, original);
  const mirror = 'https://mirrors.edge.kernel.org/ubuntu';
  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; rewrite_sources "$2" "$3"',
      'test',
      script,
      mirror,
      source,
    ],
    { env },
  );
  expect(readFileSync(source, 'utf8')).toBe(
    original
      .replace('http://azure.archive.ubuntu.com/ubuntu', mirror)
      .replace('https://security.ubuntu.com/ubuntu', mirror),
  );
});
