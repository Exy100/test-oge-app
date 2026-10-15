import {
  numbersSchema,
  statisticsSchema,
  type TopicStatistics,
} from './schemas.ts';
import type { TaskNumber } from '../types.ts';

export function emptyTopicStatistics(taskNumber: TaskNumber): TopicStatistics {
  return {
    taskNumber,
    automatic: { attempts: 0, correct: 0 },
    self: { attempts: 0, credit: 0 },
    aiAccepted: { attempts: 0, credit: 0 },
  };
}
export function topicAccuracy(row: TopicStatistics): number | null {
  const attempts =
    row.automatic.attempts + row.self.attempts + row.aiAccepted.attempts;
  return attempts === 0
    ? null
    : (row.automatic.correct + row.self.credit + row.aiAccepted.credit) /
        attempts;
}
export interface StreamProbability {
  taskNumber: TaskNumber;
  accuracy: number | null;
  errorWeight: number;
  probability: number;
}
/** Probabilities describe random draws; review tasks have a separate scheduler. */
export function streamDistribution(
  numbers: readonly TaskNumber[],
  statistics: readonly TopicStatistics[] = [],
): StreamProbability[] {
  const selected = numbersSchema.parse(numbers).sort((a, b) => a - b);
  const rows = statisticsSchema.parse(statistics);
  const accuracies = new Map(
    rows.map((row) => [row.taskNumber, topicAccuracy(row)]),
  );
  const known = selected.flatMap((number) => {
    const accuracy = accuracies.get(number);
    return accuracy === undefined || accuracy === null ? [] : [1 - accuracy];
  });
  // Missing evidence is neutral, not a fictitious success or failure.
  const neutral = known.length
    ? known.reduce((sum, weight) => sum + weight, 0) / known.length
    : 0;
  const result = selected.map((taskNumber) => {
    const accuracy = accuracies.get(taskNumber) ?? null;
    return {
      taskNumber,
      accuracy,
      errorWeight: accuracy === null ? neutral : 1 - accuracy,
    };
  });
  const total = result.reduce((sum, row) => sum + row.errorWeight, 0);
  return result.map((row) => ({
    ...row,
    probability:
      total === 0
        ? 1 / selected.length
        : 0.5 / selected.length + 0.5 * (row.errorWeight / total),
  }));
}
