import { checkDistSecrets } from './check-dist-secrets.mjs';

const files = await checkDistSecrets(
  new URL('../.cache/ai-worker/', import.meta.url),
);
console.info(`Worker security: ${String(files)} files; no secret markers.`);
