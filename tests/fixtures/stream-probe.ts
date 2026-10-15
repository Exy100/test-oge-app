import {
  createStreamSession,
  configureStream,
  nextStreamTask,
  recordStreamResult,
  restoreStreamState,
  streamDistribution,
  type StreamItem,
  type StreamOutcome,
} from '../../src/core/stream/index.ts';
import { streamSources } from '../../src/core/stream/catalog.ts';
import { examConfig } from '../../src/core/exam/exam.config.ts';
import type { TaskNumber } from '../../src/core/types.ts';

export function streamProbe(seed: string) {
  const all: TaskNumber[] = Array.from(
    { length: 16 },
    (_, index) => (index + 1) as TaskNumber,
  );
  let state = createStreamSession(seed, {
    sources: streamSources(),
    numbers: [1],
  });
  const trace: StreamItem[] = [];
  let formatUnchanged = true;
  let roundTrip = true;
  for (let index = 0; index < 64; index += 1) {
    if (index === 8 || index === 45)
      state = configureStream(state, {
        numbers: all,
        variant13: 'presentation',
      });
    if (index === 20 || index === 35)
      state = configureStream(state, {
        numbers: [1, 13, 14],
        variant13: index === 20 ? 'document' : 'presentation',
      });
    const active = nextStreamTask(state);
    trace.push(active.current);
    if (index % 11 === 0)
      formatUnchanged &&=
        JSON.stringify(recordStreamResult(active, { kind: 'format-error' })) ===
        JSON.stringify(active);
    const number = active.current.reference.taskNumber;
    const maximum = examConfig.tasks[number].maxScore;
    const outcome: StreamOutcome =
      index % 7 === 6
        ? { kind: 'skip' }
        : number <= 12
          ? { kind: 'automatic', correct: index % 3 !== 0 }
          : index % 5 === 0
            ? { kind: 'practice', score: null }
            : {
                kind: 'practice',
                score: index % (maximum + 1),
                source: index % 2 === 0 ? 'self' : 'aiAccepted',
              };
    state = recordStreamResult(active, outcome);
    const restored = restoreStreamState(JSON.parse(JSON.stringify(state)));
    roundTrip &&= JSON.stringify(state) === JSON.stringify(restored);
    state = restored;
  }
  return {
    trace,
    draws: state.draws,
    completed: state.completed,
    distribution: streamDistribution(state.numbers, state.statistics),
    statistics: state.statistics,
    reviews: state.reviews,
    formatUnchanged,
    roundTrip,
  };
}
