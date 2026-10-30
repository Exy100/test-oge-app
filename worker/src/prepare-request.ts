import { z } from '../../src/core/zod';
import { generators } from '../../src/core/generators';
import { bankTasks } from '../../src/core/banks';
import { TaskInstanceSchema } from '../../src/core/schemas';
import { checkTaskAnswer, type AnswerCheck } from '../../src/core/checker';
import type { TaskInstance } from '../../src/core/types';
import type { FeedbackRequest } from '../../src/lib/ai/contract';
import { requestContracts } from './contracts';

type Identity =
  | { generatorId: string; seed: string }
  | { bankId: string; seed?: string | undefined };
type Part2Request = z.infer<(typeof requestContracts)['/api/ai/part2-grade']>;

export class PreparationError extends Error {
  constructor(readonly status: 400 | 500) {
    super('Не удалось подготовить задание.');
  }
}
function validated<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new PreparationError(400);
  return result.data;
}
function allowed(taskNumber: number, mode: 'short' | 'part2') {
  if (mode === 'short' ? taskNumber > 12 : taskNumber <= 12)
    throw new PreparationError(400);
}
/** Only registry identities are accepted; never deserialize a client task. */
function reconstruct(
  identity: Identity,
  mode: 'short' | 'part2',
): TaskInstance {
  if ('bankId' in identity) {
    const task = bankTasks.find((entry) => entry.id === identity.bankId);
    if (!task || (identity.seed !== undefined && identity.seed !== task.seed))
      throw new PreparationError(400);
    allowed(task.taskNumber, mode);
    const parsed = TaskInstanceSchema.safeParse(task);
    if (!parsed.success) throw new PreparationError(500);
    return parsed.data;
  }
  const generator = generators.find(
    (entry) => entry.id === identity.generatorId,
  );
  if (!generator) {
    // Cards identify curated work by its registry version and seed as well.
    const task = bankTasks.find(
      (entry) =>
        entry.generatorId === identity.generatorId &&
        entry.seed === identity.seed,
    );
    if (!task) throw new PreparationError(400);
    return reconstruct({ bankId: task.id, seed: identity.seed }, mode);
  }
  allowed(generator.taskNumber, mode);
  try {
    const parsed = TaskInstanceSchema.safeParse(
      generator.generate(identity.seed),
    );
    if (
      !parsed.success ||
      parsed.data.generatorId !== generator.id ||
      parsed.data.seed !== identity.seed ||
      parsed.data.taskNumber !== generator.taskNumber ||
      !generator.verify(parsed.data)
    )
      throw new PreparationError(500);
    return parsed.data;
  } catch {
    // Generator failures may contain task data; never expose their diagnostics.
    throw new PreparationError(500);
  }
}

export function prepareFeedback(input: FeedbackRequest) {
  const task = reconstruct(input, 'short');
  let check: AnswerCheck;
  try {
    check = checkTaskAnswer(task, input.answer);
  } catch {
    throw new PreparationError(500);
  }
  if (check.verdict === 'format_error') throw new PreparationError(400);
  return { mode: 'stream-feedback' as const, task, check, input };
}
export function preparePart2(input: Part2Request) {
  const task = reconstruct(input, 'part2');
  if (task.answer.type !== 'artifact' || !task.criteria)
    throw new PreparationError(500);
  const office = ['presentation', 'document', 'spreadsheet'].includes(
    task.answer.kind,
  );
  const assessment = office
    ? { kind: 'criteria-help' as const, score: null }
    : { kind: 'preliminary' as const, maxScore: task.criteria.max };
  return { mode: 'part2-grade' as const, task, assessment, input };
}

export const prepareRequests = {
  '/api/ai/stream-feedback': (body: unknown) =>
    prepareFeedback(
      validated(requestContracts['/api/ai/stream-feedback'], body),
    ),
  '/api/ai/part2-grade': (body: unknown) =>
    preparePart2(validated(requestContracts['/api/ai/part2-grade'], body)),
  '/api/ai/variant-summary': (body: unknown) => ({
    mode: 'variant-summary' as const,
    input: validated(requestContracts['/api/ai/variant-summary'], body),
  }),
};

export type PreparedRequest = ReturnType<
  (typeof prepareRequests)[keyof typeof prepareRequests]
>;
