import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

const root = new URL('../', import.meta.url);

/** Loopback-only preview: the existing application and protected Worker share one origin. */
export async function startAiLocal({
  apiKey,
  port = 4328,
  workerPort = 8788,
} = {}) {
  process.env.ASTRO_TELEMETRY_DISABLED = '1';
  process.env.NODE_ENV = 'development';
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.PUBLIC_AI_MODE = 'api';
  process.env.PUBLIC_AI_PROVIDER = 'routerai';
  await import('./test-tls.mjs');
  const { unstable_dev } = await import('wrangler');
  const { dev } = await import('astro');
  const origin = `https://127.0.0.1:${String(port)}`;
  let worker;
  let app;
  try {
    const bindings = {
      SITE_ORIGIN: origin,
      AI_PROVIDER: 'routerai',
      AI_ENABLED: apiKey ? 'true' : 'false',
      ...(apiKey ? { ROUTERAI_API_KEY: apiKey } : {}),
      AI_IP_HMAC_SECRET:
        process.env.AI_IP_HMAC_SECRET ?? randomBytes(32).toString('hex'),
    };
    worker = await unstable_dev(
      fileURLToPath(new URL('worker/src/index.ts', root)),
      {
        config: fileURLToPath(new URL('worker/wrangler.toml', root)),
        envFiles: [],
        ip: '127.0.0.1',
        port: workerPort,
        local: true,
        persist: true,
        persistTo: fileURLToPath(new URL('.cache/ai-local/', root)),
        logLevel: 'none',
        // This Wrangler version consumes the CLI-shaped `var`, despite declaring `vars`.
        // These values stay in-process; they are never passed as shell arguments.
        var: Object.entries(bindings).map(
          ([name, value]) => `${name}:${value}`,
        ),
        experimental: { disableExperimentalWarning: true, watch: false },
      },
    );
    app = await dev({
      root: fileURLToPath(root),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port },
      vite: {
        cacheDir: fileURLToPath(new URL('.cache/ai-local/vite/', root)),
        plugins: [
          {
            name: 'ai-loopback-api',
            enforce: 'post',
            configureServer(server) {
              // Install after Astro's base middleware so /api stays at the origin root.
              return () =>
                server.middlewares.stack.unshift({
                  route: '',
                  handle(incoming, outgoing, next) {
                    if (!incoming.url?.startsWith('/api/ai/')) return next();
                    const forwardedHeaders = (values) =>
                      Object.fromEntries(
                        Object.entries(values).filter(
                          ([name]) =>
                            !name.startsWith(':') &&
                            ![
                              'connection',
                              'keep-alive',
                              'proxy-connection',
                              'transfer-encoding',
                              'upgrade',
                            ].includes(name),
                        ),
                      );
                    const incomingHost =
                      incoming.headers.host ?? incoming.headers[':authority'];
                    const headers = forwardedHeaders(incoming.headers);
                    headers.host = `127.0.0.1:${String(worker.port)}`;
                    headers['cf-connecting-ip'] =
                      incoming.socket.remoteAddress ?? '127.0.0.1';
                    // Browsers omit Origin on same-origin GET; the HTTP hop loses HTTPS.
                    if (
                      incoming.method === 'GET' &&
                      incoming.url.split('?')[0] === '/api/ai/health' &&
                      !headers.origin &&
                      incomingHost === new URL(origin).host
                    )
                      headers.origin = origin;
                    const forwarded = httpRequest(
                      {
                        hostname: '127.0.0.1',
                        port: worker.port,
                        path: incoming.url,
                        method: incoming.method,
                        headers,
                      },
                      (response) => {
                        outgoing.writeHead(
                          response.statusCode ?? 502,
                          forwardedHeaders(response.headers),
                        );
                        response.pipe(outgoing);
                      },
                    );
                    outgoing.once('close', () => forwarded.destroy());
                    incoming.once('aborted', () => forwarded.destroy());
                    forwarded.once('error', () => {
                      if (outgoing.headersSent) return outgoing.destroy();
                      outgoing.writeHead(502, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                      });
                      outgoing.end(
                        JSON.stringify({ error: { code: 'unavailable' } }),
                      );
                    });
                    incoming.pipe(forwarded);
                  },
                });
            },
          },
        ],
        server: {
          strictPort: true,
          https: {
            key: await readFile(new URL('.cache/test-tls/key.pem', root)),
            cert: await readFile(new URL('.cache/test-tls/cert.pem', root)),
          },
        },
      },
    });
    return {
      origin,
      async stop() {
        await app.stop();
        await worker.stop();
      },
    };
  } catch {
    await app?.stop();
    await worker?.stop();
    throw new Error(
      'Не удалось запустить локальное приложение и API. Проверь доступность портов 4328 и 8788.',
    );
  }
}

async function readKey() {
  if (process.env.ROUTERAI_API_KEY) return process.env.ROUTERAI_API_KEY;
  if (!process.stdin.isTTY)
    throw new Error(
      'Нужен интерактивный терминал для скрытого ввода нового ключа RouterAI. Для проверки без модели добавь --disabled.',
    );
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  try {
    process.stdout.write(
      'Новый ключ RouterAI (ввод скрыт; только в памяти сервера): ',
    );
    return (await input.question('')).trim();
  } finally {
    input.close();
    process.stdout.write('\n');
  }
}

if (import.meta.main) {
  try {
    const disabled = process.argv.includes('--disabled');
    const apiKey = disabled ? undefined : await readKey();
    if (!disabled && !apiKey)
      throw new Error('Ключ не введён. Запросы к модели не выполнялись.');
    const local = await startAiLocal({ apiKey });
    console.info(`Приложение: ${local.origin}/test-oge-app/`);
    console.info(
      disabled
        ? 'ИИ выключен; внешних запросов нет.'
        : 'RouterAI: Luna → Sonnet. Запросы платные и отправляются только после согласия в приложении.',
    );
    console.info(
      'Для HTTPS используется локальный тестовый сертификат. Остановка: Ctrl+C.',
    );
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await local.stop();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (cause) {
    // Never print a runtime configuration or an upstream diagnostic containing credentials.
    console.error(
      cause instanceof Error ? cause.message : 'Локальный запуск не выполнен.',
    );
    process.exitCode = 1;
  }
}
