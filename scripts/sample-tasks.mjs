import { createServer } from 'vite';

let server;
try {
  const args = process.argv.slice(2);
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !['--task', '--n', '--seed'].includes(key) ||
      value === undefined ||
      options.has(key)
    )
      throw new Error('Используй --task 1 --n 50 [--seed пример].');
    options.set(key, value);
  }
  const task = Number(options.get('--task'));
  const n = Number(options.get('--n') ?? '20');
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
  process.stdout.write(sampleTasks(task, n, options.get('--seed') ?? 'sample'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
