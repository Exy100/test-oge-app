import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const output = resolve('.cache/dataset-sample');
let server;
try {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const { createExampleDataset, verifyArchive } = await server.ssrLoadModule(
    '/src/core/datasets/index.ts',
  );
  const dataset = await createExampleDataset('libreoffice-check-v1');
  await verifyArchive(dataset.manifest, dataset.archive);
  await mkdir(output, { recursive: true });
  for (const [path, bytes] of dataset.files) {
    const target = resolve(output, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(
    resolve(output, 'manifest.json'),
    JSON.stringify(dataset.manifest, null, 2) + '\n',
  );
  await writeFile(resolve(output, 'dataset.zip'), dataset.archive);
  console.log('Набор и манифест: .cache/dataset-sample');
} finally {
  await server?.close();
}
