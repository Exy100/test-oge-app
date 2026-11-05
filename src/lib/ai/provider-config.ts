export {
  AI_SERVICE_ID as AI_PROVIDER,
  AI_SERVICE_NAME as AI_PROVIDER_NAME,
  AI_SERVICE_POLICY as AI_CONSENT_POLICY,
} from './service';
export const AI_API_ENABLED = import.meta.env.PUBLIC_AI_MODE === 'api';
