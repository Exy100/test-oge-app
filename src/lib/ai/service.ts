import { routerAiExecution } from '../../core/ai-execution';
import { aiServiceId, aiServices } from '../../core/ai-service';

export const AI_SERVICE_ID = aiServiceId(import.meta.env.PUBLIC_AI_PROVIDER);
export const AI_SERVICE_NAME = aiServices[AI_SERVICE_ID].name;
export const AI_SERVICE_POLICY = aiServices[AI_SERVICE_ID].policy;

/** Sent to our own API so a stale build cannot silently switch recipients. */
export const aiServiceHeaders = { 'X-AI-Provider': AI_SERVICE_ID };

export const AI_CLIENT_TIMEOUT_MS =
  AI_SERVICE_ID === 'routerai' ? routerAiExecution.clientTimeoutMs : 30_000;

/** Invalidate answers produced before the model profiles and revised prompts. */
export const AI_CACHE_POLICY = `${AI_SERVICE_POLICY}/responses-v2`;
