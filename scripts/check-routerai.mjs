import { build } from 'vite';
import { unstable_readConfig as readConfig } from 'wrangler';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// This command is intentionally separate from verify/CI: it can make up to three paid requests.
let state = { calls: 0, statuses: [] };
try {
  const apiKey = process.env.ROUTERAI_API_KEY;
  if (!apiKey) throw new Error('Missing server credential');
  const config = readConfig(
    { config: 'worker/wrangler.toml' },
    { hideWarnings: true },
  );
  if (config.vars.AI_PROVIDER !== 'routerai') throw new Error('Wrong provider');
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir: '.cache/routerai-smoke',
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: 'scripts/routerai-smoke.ts',
        formats: ['es'],
        fileName: 'probe',
      },
    },
  });
  const { probeRouterAi, routerAiProbeTransport } = await import(
    pathToFileURL(resolve('.cache/routerai-smoke/probe.js')).href
  );
  const probe = routerAiProbeTransport(fetch);
  state = probe.state;
  const results = await probeRouterAi(config.vars, apiKey, probe.transport);
  console.info(JSON.stringify({ passed: true, ...state, results }));
} catch {
  // Provider errors may contain credentials or work: report only counters/statuses.
  console.error(
    JSON.stringify({
      passed: false,
      ...state,
      error:
        'RouterAI smoke failed: check server configuration, network, credential or response protocol.',
    }),
  );
  process.exitCode = 1;
}
