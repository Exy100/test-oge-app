import type { prepareRequests } from '../prepare-request';
import { feedbackPrompt } from './stream-feedback';
import { part2Prompt } from './part2-grade';
import { summaryPrompt } from './variant-summary';

type PreparedRequest = ReturnType<
  (typeof prepareRequests)[keyof typeof prepareRequests]
>;

/** Only server preparation supplies task data; raw request fields never set roles. */
export function buildPrompt(prepared: PreparedRequest) {
  switch (prepared.mode) {
    case 'stream-feedback':
      return feedbackPrompt(prepared);
    case 'part2-grade':
      return part2Prompt(prepared);
    case 'variant-summary':
      return summaryPrompt(prepared);
  }
}
