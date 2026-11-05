/** Validated RouterAI profiles; changing the two configured models does not add attempts. */
export function routerAiProfile(model: string) {
  switch (model) {
    case 'openai/gpt-6-luna':
      return { native: false, effort: 'high' } as const;
    case 'anthropic/claude-opus-5.5':
    case 'anthropic/claude-sonnet-5.5':
      return { native: true, effort: 'medium' } as const;
    default:
      return undefined;
  }
}
