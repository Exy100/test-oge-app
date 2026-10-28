import { renderRichText } from '../../core/rich-text/render';
import {
  FeedbackError,
  feedbackRequestSchema,
  type FeedbackProvider,
  type FeedbackRequest,
} from './contract';

export { feedbackErrorMessage } from './contract';
export const MAX_FEEDBACK_LENGTH = 12000;

/** Consume any provider through the same bounded, sanitised UI contract. */
export async function consumeFeedback(
  provider: FeedbackProvider,
  input: FeedbackRequest,
  signal: AbortSignal,
  update: (html: string) => void,
): Promise<void> {
  signal.throwIfAborted();
  const parsed = feedbackRequestSchema.safeParse(input);
  if (!parsed.success) throw new FeedbackError('invalid-request');
  let text = '';
  for await (const chunk of provider.streamFeedback(parsed.data, signal)) {
    signal.throwIfAborted();
    if (
      typeof chunk !== 'string' ||
      text.length + chunk.length > MAX_FEEDBACK_LENGTH
    )
      throw new FeedbackError('invalid-response');
    text += chunk;
    if (chunk) update(renderRichText(text));
  }
  signal.throwIfAborted();
  if (!text.trim()) throw new FeedbackError('invalid-response');
}
