import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import { prepareRequests } from '../../worker/src/prepare-request';
import { answer } from './stream-answers';

export const routerEnv = {
  SITE_ORIGIN: 'https://exy100.github.io',
  OPENROUTER_API_KEY: 'fixture-credential',
  AI_MODEL_PRIMARY: 'test/primary',
  AI_MODEL_FALLBACK: 'test/fallback',
};

export function providerPayload(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string')
    throw new Error('Ожидалось строковое тело провайдера.');
  return JSON.parse(init.body) as unknown;
}
const numeric = generators.find((item) => item.id === 'numeral-sum-v2');
const program = generators.find((item) => item.taskNumber === 16);
const office = bankTasks[0];
if (!numeric || !program || !office)
  throw new Error('Нет заданий для проверки транспорта.');
const task = numeric.generate('openrouter-transport-v1');
export const feedbackInput = {
  generatorId: numeric.id,
  seed: task.seed,
  answer: answer(task, true),
};
export const programInput = {
  generatorId: program.id,
  seed: 'openrouter-transport-v1',
  solution: 'print(1)',
};
export const officeInput = {
  bankId: office.id,
  solution: 'Проверил оформление.',
};
export const summaryInput = {
  variantSeed: 'openrouter-transport-v1',
  results: [{ n: 1, score: 1, timeSec: 60 }],
  part2Self: [],
};
export const preparedFeedback =
  prepareRequests['/api/ai/stream-feedback'](feedbackInput);
export const preparedProgram =
  prepareRequests['/api/ai/part2-grade'](programInput);
export const preparedOffice =
  prepareRequests['/api/ai/part2-grade'](officeInput);
export const preparedSummary =
  prepareRequests['/api/ai/variant-summary'](summaryInput);
export const programGrade = {
  kind: 'preliminary',
  score: 1,
  reason: 'Предварительный разбор по критериям.',
  errors: ['Не разобран граничный случай.'],
  advice: 'Проверь граничные значения.',
};
export const officeGrade = {
  kind: 'criteria-help',
  score: null,
  reason: 'Файл не получен.',
  errors: [],
  advice: 'Открой готовый файл и проверь критерии.',
};

export function delta(text: string, finish: string | null = null) {
  return `data: ${JSON.stringify({ model: 'private-provider-model', choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\n`;
}
export function completedStream(text = 'Привет, ученик!') {
  return delta(text) + delta('', 'stop') + 'data: [DONE]\n\n';
}
export function providerStream(raw = completedStream()) {
  return new Response(raw, {
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Provider-Diagnostic': 'private-provider-header',
    },
  });
}
export function completion(grade: unknown = programGrade) {
  return Response.json({
    model: 'private-provider-model',
    choices: [
      {
        message: {
          content: typeof grade === 'string' ? grade : JSON.stringify(grade),
        },
        finish_reason: 'stop',
      },
    ],
  });
}
