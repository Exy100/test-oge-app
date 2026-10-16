import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = resolve('docs/reviews/t3.15-files');
let server;
try {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const { confirmedFileGenerators } = await server.ssrLoadModule(
    '/src/core/generators/exam/file-generators.ts',
  );
  const { createTaskDataset } = await server.ssrLoadModule(
    '/src/core/generators/task-dataset.ts',
  );
  const { validateGeneratedTask } = await server.ssrLoadModule(
    '/src/core/generators/harness.ts',
  );
  function reviewTask(generator, number, index) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const seed = `t3.15-files-review-20261017:${String(number)}:${String(index)}:${String(attempt)}`,
        task = generator.generate(seed),
        expected = index % 3;
      const form =
        number === 11
          ? task.statement.includes('Как звали щенка')
            ? 0
            : task.statement.includes('Какова фамилия')
              ? 1
              : 2
          : task.statement.includes('.jpeg')
            ? 2
            : task.statement.includes('.tiff')
              ? 1
              : 0;
      const level =
        number === 11
          ? index === 2 || index === 9
            ? 3
            : undefined
          : index < 3
            ? index + 1
            : undefined;
      if (
        form === expected &&
        (level === undefined || task.difficulty === level)
      )
        return validateGeneratedTask(generator, seed);
    }
    throw new Error(
      'Could not sample every supported review form and difficulty',
    );
  }
  const answers = [];
  for (const generator of confirmedFileGenerators) {
    const number = generator.taskNumber,
      folder = resolve(destination, String(number));
    await mkdir(folder, { recursive: true });
    const blocks = [
      `# T3.15: №${String(number)}, десять задач для предметного ревью`,
      'Авторские материалы. Предметное ревью человеком ожидается. Все десять задач используют один и тот же корпус, ответы находятся отдельно в answers.json.',
      'Выборка подобрана по формам и уровням сложности; она не описывает частотность заданий на экзамене.',
    ];
    let archive;
    for (let i = 0; i < 10; i++) {
      const task = reviewTask(generator, number, i),
        seed = task.seed,
        dataset = await createTaskDataset(task),
        key = String(i + 1).padStart(2, '0');
      if (archive && !Buffer.from(archive).equals(Buffer.from(dataset.archive)))
        throw new Error('Shared corpus changed across questions');
      if (!archive) {
        archive = dataset.archive;
        await writeFile(resolve(folder, 'dataset.zip'), archive);
      }
      await writeFile(
        resolve(folder, `${key}.manifest.json`),
        JSON.stringify(dataset.manifest, null, 2) + '\n',
      );
      blocks.push(
        `## ${String(i + 1)}. ${generator.title}`,
        `Seed: \`${seed}\`. Сложность: ${String(task.difficulty)}.`,
        task.statement,
        `[Набор файлов](${String(number)}/dataset.zip) · [Манифест](${String(number)}/${key}.manifest.json)`,
      );
      answers.push({
        task,
        archive: `${String(number)}/dataset.zip`,
        manifest: `${String(number)}/${key}.manifest.json`,
      });
    }
    await writeFile(
      resolve(destination, `${String(number)}.md`),
      blocks.join('\n\n') + '\n',
    );
  }
  await writeFile(
    resolve(destination, 'answers.json'),
    JSON.stringify(answers, null, 2) + '\n',
  );
  console.log(
    'Exported 20 file tasks, two shared ZIP corpora, separate answers and 20 manifests.',
  );
} finally {
  await server?.close();
}
