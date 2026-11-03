import { generators } from '../../src/core/generators';
import { prepareRequests } from '../../worker/src/prepare-request';
import { answer } from './stream-answers';
import { quotaSettings } from './ai-quota';

export const routerAiSettings = {
  ...quotaSettings,
  AI_PROVIDER: 'routerai',
  AI_API_BASE_URL: 'https://routerai.ru/api/v1',
  ROUTERAI_API_KEY: 'fixture-routerai-credential',
  AI_MODEL_SIMPLE: 'openai/gpt-6-luna',
  AI_MODEL_PRIMARY: 'anthropic/claude-sonnet-5.5',
  AI_MODEL_FALLBACK: 'anthropic/claude-opus-5.5',
  AI_SIMPLE_TASK_NUMBERS: '1,2,3,4',
  AI_REASONING_EFFORT: 'low',
};
export function routerAiFeedback(number: number) {
  const generator = generators.find((entry) => entry.taskNumber === number);
  if (!generator) throw new Error('Нет генератора для маршрутизации.');
  const task = generator.generate('routerai-routing');
  const input = {
    generatorId: generator.id,
    seed: task.seed,
    answer: answer(task, true),
  };
  return { input, prepared: prepareRequests['/api/ai/stream-feedback'](input) };
}
