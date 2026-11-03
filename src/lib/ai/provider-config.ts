import { z } from '../../core/zod';

export const AI_API_ENABLED = import.meta.env.PUBLIC_AI_MODE === 'api';
/** Public identity binds consent/cache to the intermediary named in this build. */
export const AI_PROVIDER = z
  .enum(['openrouter', 'routerai'])
  .parse(import.meta.env.PUBLIC_AI_PROVIDER ?? 'openrouter');
export const AI_PROVIDER_NAME =
  AI_PROVIDER === 'routerai' ? 'RouterAI' : 'OpenRouter';
export const AI_CONSENT_POLICY =
  AI_PROVIDER === 'routerai'
    ? 'routerai-feedback-v1'
    : 'openrouter-feedback-v1';
