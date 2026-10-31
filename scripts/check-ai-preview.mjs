const [address, expected = 'disabled'] = process.argv.slice(2);
try {
  if (!address || !['enabled', 'disabled'].includes(expected))
    throw new Error('Usage: npm run ai:smoke -- https://site.example disabled');
  const origin = new URL(address);
  if (
    origin.origin !== address ||
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(origin.hostname)
      ))
  )
    throw new Error(
      'Supply an HTTPS origin without a path; HTTP is allowed only on localhost.',
    );
  const response = await fetch(new URL('/api/ai/health', origin), {
    headers: { Origin: origin.origin },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (
    response.status !== 200 ||
    !response.body ||
    response.headers.get('Content-Type')?.split(';')[0] !==
      'application/json' ||
    response.headers.get('Cache-Control') !== 'no-store' ||
    response.headers.get('X-Content-Type-Options') !== 'nosniff'
  )
    throw new Error('Health status or response security headers are invalid.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 1024) throw new Error('Health response exceeds 1024 bytes.');
    chunks.push(chunk);
  }
  const data = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
  );
  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(data).length !== 1 ||
    typeof data.enabled !== 'boolean' ||
    data.enabled !== (expected === 'enabled')
  )
    throw new Error('Health does not match the expected configuration.');
  console.info(
    `AI preview: ${expected}; security headers checked. No student data or billable requests sent.`,
  );
} catch (cause) {
  console.error(
    cause instanceof Error ? cause.message : 'AI preview check failed.',
  );
  process.exitCode = 1;
}
