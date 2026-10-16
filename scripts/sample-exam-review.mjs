import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Teacher review packet, with answers kept separately from student conditions.
const destination = resolve('docs/reviews/t3.15-short');
const reviewSeed = 't3.15-review-20261016';
let server;
try {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const { confirmedShortGenerators } = await server.ssrLoadModule(
    '/src/core/generators/exam/short-generators.ts',
  );
  const { validateGeneratedTask } = await server.ssrLoadModule(
    '/src/core/generators/harness.ts',
  );
  const { Rng } = await server.ssrLoadModule('/src/core/rng.ts');
  const rng = new Rng(reviewSeed),
    answers = [
      '# Ответы и решения для предметного ревью T3.15',
      'Сначала реши задачи из файлов 01–10.md. Здесь приведены эталоны генератора;',
      'автоматический независимый оракул проверяется отдельно в exam-short-generators.test.ts.',
    ];
  await mkdir(destination, { recursive: true });
  for (let number = 1; number <= 10; number++) {
    const generators = rng.shuffle(
        confirmedShortGenerators.filter(
          (generator) => generator.taskNumber === number,
        ),
      ),
      blocks = [
        `# T3.15: №${String(number)}, 10 задач для предметного ревью`,
        'Авторские условия. Предметное ревью человеком ожидается; повторный Gate 3 остаётся открытым.',
        '[Ответы и решения](answers.md) открывай после самостоятельного решения.',
      ];
    answers.push(`## №${String(number)}`);
    for (let i = 0; i < 10; i++) {
      const generator = generators[i % generators.length];
      if (!generator) throw new Error('Missing confirmed generator');
      const seed = `${reviewSeed}:${String(number)}:${String(rng.int(1, 1_000_000))}`,
        task = validateGeneratedTask(generator, seed),
        answer = task.answer;
      if (answer.type === 'artifact') throw new Error('Expected short answer');
      blocks.push(
        `## ${String(i + 1)}. ${generator.title}`,
        `ID: ${generator.id}. Seed: \`${seed}\`. Сложность: ${String(task.difficulty)}.`,
        task.statement,
      );
      if (task.figure?.kind === 'directed-graph') {
        const figure = task.figure;
        blocks.push(
          figure.description,
          '```mermaid\nflowchart LR\n' +
            figure.edges
              .map(({ from, to }) => {
                if (!/^[A-H]$/u.test(from) || !/^[A-H]$/u.test(to))
                  throw new Error('Unsafe graph label');
                return `    ${from} --> ${to}`;
              })
              .join('\n') +
            '\n```',
        );
      }
      const policy =
        answer.type === 'sequence' && answer.alternatives
          ? [answer.value, ...answer.alternatives].join(', ')
          : answer.type === 'integer' && answer.acceptedRange
            ? `любое целое ${[answer.acceptedRange.min !== undefined ? `A ≥ ${answer.acceptedRange.min}` : null, answer.acceptedRange.max !== undefined ? `A ≤ ${answer.acceptedRange.max}` : null].filter(Boolean).join(' и ')}`
            : answer.value;
      answers.push(
        `### ${String(number)}.${String(i + 1)}`,
        `Seed: \`${seed}\`. Ответ: **${policy}**.`,
        task.solution
          .map(
            (step, index) =>
              `${String(index + 1)}. ${step.text}${step.formula ? `\n\n$$${step.formula}$$` : ''}`,
          )
          .join('\n\n'),
      );
    }
    await writeFile(
      resolve(destination, `${String(number).padStart(2, '0')}.md`),
      blocks.join('\n\n') + '\n',
    );
  }
  await writeFile(
    resolve(destination, 'answers.md'),
    answers.join('\n\n') + '\n',
  );
  console.log(
    'T3.15: exported 100 review tasks (№1–10) with separate answers.',
  );
} finally {
  await server?.close();
}
