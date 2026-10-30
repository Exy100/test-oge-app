import { renderFeedback } from './render';
import type { SessionCache } from '../../core/storage/cache';
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
): Promise<string> {
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
    if (chunk) update(renderFeedback(text));
  }
  signal.throwIfAborted();
  if (!text.trim() || !renderFeedback(text))
    throw new FeedbackError('invalid-response');
  return text;
}

/** Cache only raw, complete markdown; every hit is rendered through the allowlist. */
export async function consumeCachedFeedback(
  provider: FeedbackProvider,
  input: FeedbackRequest,
  signal: AbortSignal,
  update: (html: string) => void,
  cache: SessionCache,
) {
  signal.throwIfAborted();
  const parsed = feedbackRequestSchema.safeParse(input);
  if (!parsed.success) throw new FeedbackError('invalid-request');
  const request = parsed.data;
  const taskId = (
    await cache.key(
      'identity',
      'identity',
      JSON.stringify([request.generatorId, request.seed]),
    )
  ).answerHash;
  const answer = JSON.stringify([request.answer, request.reasoning ?? '']);
  const mode = 'stream-feedback/openrouter-feedback-v1';
  let cached: string | undefined;
  try {
    cached = await cache.get(mode, taskId, answer);
  } catch {
    cached = undefined;
  }
  signal.throwIfAborted();
  if (cached?.trim() && cached.length <= MAX_FEEDBACK_LENGTH) {
    const html = renderFeedback(cached);
    if (html) {
      update(html);
      return;
    }
  }
  const text = await consumeFeedback(provider, request, signal, update);
  signal.throwIfAborted();
  // Failure to persist must never trigger another billable request or hide a valid answer.
  try {
    await cache.set(mode, taskId, answer, text);
  } catch {
    return;
  }
  if (signal.aborted) cache.clear();
}
