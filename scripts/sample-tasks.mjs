import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

let server;
try {
  const args = process.argv.slice(2);
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !['--task', '--n', '--seed', '--files-dir', '--variant'].includes(key) ||
      value === undefined ||
      options.has(key)
    )
      throw new Error(
        'Используй --task 1 --n 50 [--seed пример] [--files-dir путь для №11–16] [--variant presentation|document].',
      );
    options.set(key, value);
  }
  const task = Number(options.get('--task'));
  const variant = options.get('--variant') ?? 'presentation';
  if (
    !['presentation', 'document'].includes(variant) ||
    (options.has('--variant') && task !== 13)
  )
    throw new Error('--variant presentation|document доступен только для №13.');
  const n = Number(options.get('--n') ?? (task === 13 ? '12' : '20'));
  if (!Number.isInteger(task) || task < 1 || task > 16)
    throw new Error('Укажи номер задания от 1 до 16 через --task.');
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const { sampleTasks } = await server.ssrLoadModule(
    '/src/core/generators/sample.ts',
  );
  const seed = options.get('--seed') ?? 'sample';
  const output = options.get('--files-dir');
  if (
    output !== undefined &&
    (![11, 12, 13, 14, 15, 16].includes(task) || !output.trim())
  )
    throw new Error(
      '--files-dir доступен для файловых наборов №11–16 и требует путь.',
    );
  const markdown = sampleTasks(
    task,
    n,
    seed,
    output ? encodeURIComponent(basename(resolve(output))) : undefined,
    variant,
  );
  if (output) {
    const { generatorsForTask } = await server.ssrLoadModule(
      '/src/core/generators/index.ts',
    );
    const { createTaskDataset } = await server.ssrLoadModule(
      '/src/core/generators/task-dataset.ts',
    );
    const entries = generatorsForTask(task);
    const { bankTasks } = await server.ssrLoadModule(
      '/src/core/banks/index.ts',
    );
    for (let index = 0; index < n; index++) {
      const generated =
        task === 13
          ? bankTasks.filter((item) => item.variant13 === variant)[index]
          : entries[index % entries.length].generate(`${seed}:${index}`);
      const dataset = await createTaskDataset(generated);
      const directory = resolve(output, String(index + 1).padStart(2, '0'));
      await mkdir(directory, { recursive: true });
      for (const [path, bytes] of dataset.files) {
        const target = resolve(directory, 'files', path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }
      await writeFile(resolve(directory, 'dataset.zip'), dataset.archive);
      await writeFile(
        resolve(directory, 'manifest.json'),
        JSON.stringify(dataset.manifest, null, 2) + '\n',
      );
    }
  }
  process.stdout.write(markdown);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
