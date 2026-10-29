import { expect, test } from 'vitest';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import { checkTaskAnswer } from '../../src/core/checker';
import type { FeedbackRequest } from '../../src/lib/ai/contract';
import { answer } from '../fixtures/stream-answers';
import {
  prepareFeedback,
  preparePart2,
  prepareRequests,
  PreparationError,
} from '../../worker/src/prepare-request';
import worker from '../../worker/src/index';

const origin = 'https://exy100.github.io';
const env = { SITE_ORIGIN: origin };
const short = generators.filter((generator) => generator.taskNumber <= 12);
const cases = Array.from({ length: 200 }, (_, index) => {
  const generator = short[Math.floor(index / 2) % short.length];
  if (!generator) throw new Error('Нет генератора краткого ответа.');
  const seed = `ai-server-parity-v1:${String(index)}`;
  const task = generator.generate(seed);
  const input: FeedbackRequest = {
    generatorId: generator.id,
    seed,
    answer: answer(task, index % 2 === 0),
    reasoning: 'Мой ход решения',
  };
  return { input, task, check: checkTaskAnswer(task, input.answer) };
});
function post(body: unknown, mode = 'stream-feedback') {
  return new Request(`${origin}/api/ai/${mode}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const feedback = cases[0]?.input;
if (!feedback) throw new Error('Нет случая проверки.');

test('server reconstruction reproduces client tasks and verdicts for 200 fixed seed cases', async () => {
  expect(cases).toHaveLength(200);
  expect(new Set(cases.map((entry) => entry.task.generatorId)).size).toBe(
    short.length,
  );
  expect(new Set(cases.map((entry) => entry.task.taskNumber))).toEqual(
    new Set(Array.from({ length: 12 }, (_, index) => index + 1)),
  );
  expect(
    cases.filter((entry) => entry.check.verdict === 'correct'),
  ).toHaveLength(100);
  expect(
    cases.filter((entry) => entry.check.verdict === 'incorrect'),
  ).toHaveLength(100);
  for (const entry of cases) {
    const prepared = prepareFeedback(entry.input);
    expect(prepared.task).toEqual(entry.task);
    expect(prepared.check).toEqual(entry.check);
    expect(prepared.input).toEqual(entry.input);
    // Every case also crosses the production HTTP route without a model call.
    const response = await worker.fetch(post(entry.input), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'ai-disabled',
        message: 'ИИ отключён. Доступен локальный пример на сайте.',
      },
    });
  }
}, 20_000);

test('the real Workers runtime reproduces all 200 trusted tasks and verdicts', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'tests/fixtures/ai-reconstruction-worker.ts',
        formats: ['es'],
      },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  const chunks = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Не собран Worker проверки пересборки.');
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'ai-reconstruction-parity',
          compatibilityDate: '2026-10-01',
          manifest: {
            mainModule: entry.fileName,
            modules: Object.fromEntries(
              chunks.map((chunk) => [
                chunk.fileName,
                { type: 'esm' as const, contents: chunk.code },
              ]),
            ),
          },
        },
      },
    ],
  });
  try {
    const response = await runtime.dispatchFetch('https://parity.test/', {
      method: 'POST',
      body: JSON.stringify(cases.map((entry) => entry.input)),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      cases.map((entry) => ({
        mode: 'stream-feedback',
        task: entry.task,
        check: entry.check,
        input: entry.input,
      })),
    );
  } finally {
    await runtime.dispose();
  }
}, 20_000);

for (const generator of generators.filter((entry) => entry.taskNumber >= 14)) {
  test(`practice ${generator.id} uses server criteria and fixes the assessment kind`, () => {
    const input = {
      generatorId: generator.id,
      seed: 'ai-practice-context',
      solution: 'Произвольный код остаётся текстом, а не исполняется',
    };
    const expected = generator.generate(input.seed);
    const prepared = preparePart2(input);
    expect(prepared.task).toEqual(expected);
    expect(prepared.task.criteria).toEqual(expected.criteria);
    expect(prepared.input.solution).toBe(input.solution);
    expect(prepared.assessment).toEqual(
      generator.taskNumber === 14
        ? { kind: 'criteria-help', score: null }
        : { kind: 'preliminary', maxScore: 2 },
    );
    expect(() =>
      prepareFeedback({
        generatorId: input.generatorId,
        seed: input.seed,
        answer: '1',
      }),
    ).toThrow(PreparationError);
  });
}
test('all curated presentation and document identities resolve without client task data', () => {
  expect(bankTasks).toHaveLength(24);
  for (const task of bankTasks) {
    const byBank = preparePart2({ bankId: task.id, solution: 'Мой текст' });
    const byRegistry = preparePart2({
      generatorId: task.generatorId,
      seed: task.seed,
      solution: 'Мой текст',
    });
    expect(byBank.task).toEqual(task);
    expect(byRegistry.task).toEqual(task);
    expect(byBank.assessment).toEqual({ kind: 'criteria-help', score: null });
    expect(
      preparePart2({ bankId: task.id, seed: task.seed, solution: 'Мой текст' })
        .task,
    ).toEqual(task);
    expect(() =>
      prepareFeedback({
        generatorId: task.generatorId,
        seed: task.seed,
        answer: '1',
      }),
    ).toThrow(PreparationError);
  }
});
test('each prepared task owns its criteria and cannot mutate another request or the bank', () => {
  const task = bankTasks[0];
  if (!task) throw new Error('Нет кураторского задания.');
  const before = structuredClone(task);
  const input = { bankId: task.id, solution: 'Мой текст' };
  const prepared = preparePart2(input);
  prepared.task.statement = 'Изменённая копия';
  const level = prepared.task.criteria?.levels[0];
  if (!level) throw new Error('Нет критерия.');
  level.description = 'Изменённый критерий';
  expect(task).toEqual(before);
  expect(preparePart2(input).task).toEqual(before);
});

for (const [label, body, mode] of [
  [
    'unknown generator',
    { ...feedback, generatorId: 'unknown-v9' },
    'stream-feedback',
  ],
  [
    'retired generator',
    { ...feedback, generatorId: 'numeral-sum-v1' },
    'stream-feedback',
  ],
  ['invalid answer format', { ...feedback, answer: '' }, 'stream-feedback'],
  [
    'practice in feedback',
    { generatorId: 'python-positive-mean-v1', seed: 's', answer: '1' },
    'stream-feedback',
  ],
  [
    'short answer in practice',
    { generatorId: feedback.generatorId, seed: feedback.seed, solution: '1' },
    'part2-grade',
  ],
  [
    'unknown bank',
    { bankId: 'curated-presentations-v2:P99', solution: 'Моя работа' },
    'part2-grade',
  ],
  [
    'unversioned bank',
    { bankId: 'P01', solution: 'Моя работа' },
    'part2-grade',
  ],
  [
    'retired bank',
    { bankId: 'curated-presentations-v1:P01', solution: 'Моя работа' },
    'part2-grade',
  ],
  [
    'conflicting bank seed',
    {
      bankId: 'curated-presentations-v2:P01',
      seed: 'P02',
      solution: 'Моя работа',
    },
    'part2-grade',
  ],
  [
    'unknown curated seed',
    {
      generatorId: 'curated-presentations-v2',
      seed: 'P99',
      solution: 'Моя работа',
    },
    'part2-grade',
  ],
  ['client verdict', { ...feedback, verdict: 'correct' }, 'stream-feedback'],
  [
    'client statement',
    { ...feedback, statement: 'Моя подмена условия' },
    'stream-feedback',
  ],
  [
    'client reference',
    { ...feedback, correctAnswer: 'Моя подмена эталона' },
    'stream-feedback',
  ],
  [
    'client criteria',
    {
      bankId: 'curated-documents-v2:D01',
      solution: 'Моя работа',
      criteria: { max: 3 },
    },
    'part2-grade',
  ],
] as const) {
  test(`HTTP refuses ${label} before reaching the disabled provider`, async () => {
    const response = await worker.fetch(post(body, mode), env);
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe(
      'same-origin',
    );
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    const text = await response.text();
    expect(text).not.toContain('unknown-v9');
    expect(text).not.toContain('Моя работа');
    expect(text).not.toContain('P99');
    expect(text).not.toContain('statement');
  });
}
test('a changed seed is reconstructed independently of the client reference', () => {
  const generator = generators.find((entry) => entry.id === 'numeral-sum-v2');
  if (!generator) throw new Error('Нет генератора счисления.');
  const first = generator.generate('server-original');
  if (first.answer.type === 'artifact') throw new Error('Нужен краткий ответ.');
  const correct = first.answer.value;
  const other = Array.from({ length: 10 }, (_, i) =>
    generator.generate(`server-other-${String(i)}`),
  ).find(
    (task) => task.answer.type !== 'artifact' && task.answer.value !== correct,
  );
  if (!other) throw new Error('Нет отличающегося задания.');
  const prepared = prepareFeedback({
    generatorId: generator.id,
    seed: other.seed,
    answer: correct,
  });
  expect(prepared.task).toEqual(other);
  expect(prepared.check.verdict).toBe('incorrect');
});
test('aggregate summary keeps its existing boundary and has no single-task reconstruction', () => {
  const input = {
    variantSeed: 'V01',
    results: [{ n: 1, score: 1, timeSec: 60 }],
    part2Self: [{ n: 14, score: null }],
  };
  const prepared = prepareRequests['/api/ai/variant-summary'](input);
  expect(prepared).toEqual({ mode: 'variant-summary', input });
  expect(prepared).not.toHaveProperty('task');
});
