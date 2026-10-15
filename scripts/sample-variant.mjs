import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

let server;
try {
  const options = new Map();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (
      options.has(key) ||
      !['--id', '--seed', '--variant', '--output-dir', '--all'].includes(key)
    )
      throw new Error(
        'Используй --id V01 или --seed значение, либо --all --output-dir путь; дополнительно --variant presentation|document.',
      );
    if (key === '--all') options.set(key, true);
    else {
      const value = args[++i];
      if (value === undefined || value.startsWith('--'))
        throw new Error('У аргумента отсутствует значение.');
      options.set(key, value);
    }
  }
  if (
    [options.has('--id'), options.has('--seed'), options.has('--all')].filter(
      Boolean,
    ).length > 1
  )
    throw new Error('Выбери один режим: --id, --seed или --all.');
  const selection = options.get('--variant') ?? 'presentation';
  if (!['presentation', 'document'].includes(selection))
    throw new Error('Выбери --variant presentation|document.');
  const output = options.get('--output-dir');
  if (output !== undefined && !output.trim())
    throw new Error('Нужен непустой путь --output-dir.');
  if (options.has('--all') && output === undefined)
    throw new Error('Для --all нужен --output-dir.');
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const { buildVariant, buildFixedVariant, fixedVariants } =
    await server.ssrLoadModule('/src/core/variants/index.ts');
  const { variantMarkdown } = await server.ssrLoadModule(
    '/src/core/variants/sample.ts',
  );
  const { createVariantDataset } = await server.ssrLoadModule(
    '/src/core/variants/dataset.ts',
  );
  const variants = options.has('--all')
    ? fixedVariants.map((item) => buildFixedVariant(item.id, selection))
    : [
        options.has('--seed')
          ? buildVariant(options.get('--seed'), selection)
          : buildFixedVariant(options.get('--id') ?? 'V01', selection),
      ];
  for (const variant of variants)
    if (output !== undefined) {
      const directory = options.has('--all')
        ? resolve(output, variant.id)
        : resolve(output);
      const dataset = await createVariantDataset(variant);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'dataset.zip'), dataset.archive);
      await writeFile(
        resolve(directory, 'manifest.json'),
        JSON.stringify(dataset.manifest, null, 2) + '\n',
      );
      await writeFile(
        resolve(directory, 'variant.md'),
        variantMarkdown(variant),
      );
    }
  process.stdout.write(
    options.has('--all')
      ? '# Десять учебных вариантов\n\nКаждый содержит 16 заданий и обе альтернативы №13. В комплект включены решения и эталоны; максимум выбранного варианта — 21 балл.\n\n' +
          variants
            .map((variant) => {
              const prefix = `${encodeURIComponent(basename(resolve(output)))}/${variant.id}`;
              return `- **${variant.id}**: [условия и разбор](${prefix}/variant.md) · [ZIP](${prefix}/dataset.zip) · [манифест](${prefix}/manifest.json)`;
            })
            .join('\n') +
          '\n'
      : variantMarkdown(variants[0]),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
