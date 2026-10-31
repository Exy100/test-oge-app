import { summaryRequestSchema } from '../../src/lib/ai/summary-contract';
import { feedbackRequestSchema } from '../../src/lib/ai/contract';
import { part2RequestSchema } from '../../src/lib/ai/assessment-contract';

export const requestContracts = {
  '/api/ai/stream-feedback': feedbackRequestSchema,
  '/api/ai/part2-grade': part2RequestSchema,
  '/api/ai/variant-summary': summaryRequestSchema,
};
