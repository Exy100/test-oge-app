import { aiServiceId, aiServices } from '../../core/ai-service';

export const AI_SERVICE_ID = aiServiceId(import.meta.env.PUBLIC_AI_PROVIDER);
export const AI_SERVICE_NAME = aiServices[AI_SERVICE_ID].name;
export const AI_SERVICE_POLICY = aiServices[AI_SERVICE_ID].policy;

/** Sent to our own API so a stale build cannot silently switch recipients. */
export const aiServiceHeaders = { 'X-AI-Provider': AI_SERVICE_ID };
