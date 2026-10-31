import { browserCache, browserStore } from '../../core/storage/browser';
import { hasAiConsent } from './consent';
import { FeedbackError } from './contract';
import { apiJson } from './http';
import {
  part2RequestSchema,
  readGrade,
  type Part2Request,
} from './assessment-contract';

export async function gradeWork(
  input: Part2Request,
  taskNumber: number,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  signal.throwIfAborted();
  if (!hasAiConsent(browserStore(), 'part2-grade'))
    throw new FeedbackError('consent');
  const request = part2RequestSchema.safeParse(input);
  if (
    !request.success ||
    new TextEncoder().encode(JSON.stringify(input)).length > 8192
  )
    throw new FeedbackError('work-size');
  const cache = browserCache();
  const mode = 'part2-grade/openrouter-feedback-v1';
  const key = JSON.stringify(request.data);
  try {
    const cached = await cache.get(mode, String(taskNumber), key);
    signal.throwIfAborted();
    if (cached) return readGrade(JSON.parse(cached) as unknown, taskNumber);
  } catch {
    signal.throwIfAborted();
  }
  const grade = readGrade(
    await apiJson('/api/ai/part2-grade', request.data, signal, transport),
    taskNumber,
  );
  signal.throwIfAborted();
  try {
    await cache.set(mode, String(taskNumber), key, JSON.stringify(grade));
  } catch {
    /* The completed response remains usable in memory. */
  }
  if (signal.aborted) {
    cache.clear();
    signal.throwIfAborted();
  }
  return grade;
}
