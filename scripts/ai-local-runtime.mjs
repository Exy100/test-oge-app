import { setGlobalProxyFromEnv } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { unstable_readConfig } from 'wrangler';

const root = new URL('../', import.meta.url);
const endpoint = 'https://routerai.ru/api/v1/chat/completions';

/** Actual production Worker, with a Node egress bridge that honours the session proxy. */
export async function createAiLocalWorker({
  bindings,
  port,
  transport = fetch,
  persistencePath = fileURLToPath(new URL('.cache/ai-local/v3/', root)),
}) {
  const noProxy = [
    process.env.no_proxy ?? process.env.NO_PROXY,
    '127.0.0.1',
    'localhost',
  ]
    .filter(Boolean)
    .join(',');
  const restoreProxy = setGlobalProxyFromEnv({
    ...process.env,
    no_proxy: noProxy,
    NO_PROXY: noProxy,
  });
  let runtime;
  try {
    const settings = unstable_readConfig(
      { config: fileURLToPath(new URL('worker/wrangler.toml', root)) },
      { hideWarnings: true },
    );
    const bundle = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry: settings.main, formats: ['es'] },
      },
    });
    const chunks = (Array.isArray(bundle) ? bundle : [bundle])
      .flatMap((output) => ('output' in output ? output.output : []))
      .filter((output) => output.type === 'chunk');
    const entry = chunks.find((chunk) => chunk.isEntry);
    if (!entry) throw new Error('Не собран локальный Worker.');
    runtime = new Miniflare({
      host: '127.0.0.1',
      port,
      cf: false,
      logRequests: false,
      // Preserve Wrangler's existing local SQLite counter and global-v1 identity.
      resourcePersistencePath: persistencePath,
      workers: [
        {
          config: {
            name: settings.name,
            compatibilityDate: settings.compatibility_date,
            compatibilityFlags: settings.compatibility_flags,
            manifest: {
              mainModule: entry.fileName,
              modules: Object.fromEntries(
                chunks.map((chunk) => [
                  chunk.fileName,
                  { type: 'esm', contents: chunk.code },
                ]),
              ),
            },
            env: {
              ...Object.fromEntries(
                Object.entries({ ...settings.vars, ...bindings }).map(
                  ([name, value]) => [name, { type: 'text', value }],
                ),
              ),
              AI_QUOTA: {
                type: 'durable-object',
                worker: settings.name,
                exportName: 'AiQuota',
              },
            },
            exports: { AiQuota: { type: 'durable-object', storage: 'sqlite' } },
          },
          dev: {
            outboundService: {
              type: 'fetcher',
              async handler(request) {
                if (request.url !== endpoint || request.method !== 'POST')
                  return new WorkerResponse(null, { status: 403 });
                const response = await transport(endpoint, {
                  method: 'POST',
                  redirect: 'error',
                  headers: request.headers,
                  body: request.body,
                  duplex: 'half',
                  signal: AbortSignal.any([
                    request.signal,
                    AbortSignal.timeout(30000),
                  ]),
                });
                // Node fetch decompresses bodies; do not advertise the old compressed length.
                const headers = new Headers(response.headers);
                headers.delete('Content-Encoding');
                headers.delete('Content-Length');
                return new WorkerResponse(response.body, {
                  status: response.status,
                  headers,
                });
              },
            },
          },
        },
      ],
    });
    const address = await runtime.ready;
    return {
      port: Number(address.port),
      async stop() {
        try {
          await runtime.dispose();
        } finally {
          restoreProxy();
        }
      },
    };
  } catch (error) {
    await runtime?.dispose();
    restoreProxy();
    throw error;
  }
}
