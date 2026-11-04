export const aiServices = {
  openrouter: { name: 'OpenRouter', policy: 'openrouter-feedback-v1' },
  routerai: { name: 'RouterAI', policy: 'routerai-feedback-v1' },
} as const;

export type AiServiceId = keyof typeof aiServices;

/** Only known services are selectable; an absent setting preserves existing builds. */
export function aiServiceId(value: unknown): AiServiceId {
  if (value === undefined || value === 'openrouter') return 'openrouter';
  if (value === 'routerai') return 'routerai';
  throw new Error('Неизвестный сервис ИИ.');
}
