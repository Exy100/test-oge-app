import { recordStreamResult, restoreStreamState } from './index';
import { referenceKey, type StreamOutcome, type StreamState } from './schemas';
import type { Areas } from '../storage/schemas';
import type { LocalStore } from '../storage/store';

/** Rebuild engine data from the shared store, keeping the current catalog. */
export function withStreamProgress(
  state: StreamState,
  areas: Areas,
): StreamState {
  const statistics = areas.streamStats.entries.map((row) => ({
    taskNumber: row.taskNumber,
    automatic:
      row.taskNumber <= 12
        ? { attempts: row.attempts, correct: row.correct }
        : { attempts: 0, correct: 0 },
    self: row.taskNumber > 12 ? row.self : { attempts: 0, credit: 0 },
    aiAccepted:
      row.taskNumber > 12 ? row.aiAccepted : { attempts: 0, credit: 0 },
  }));
  const reviews = areas.reviewQueue.entries.filter((entry) =>
    state.sources.some(
      (source) =>
        source.generatorId === entry.generatorId &&
        source.taskNumber === entry.taskNumber &&
        (source.kind !== 'curated' || source.seeds.includes(entry.seed)),
    ),
  );
  const current = state.current;
  return restoreStreamState({
    ...state,
    statistics,
    reviews,
    completed: areas.streamStats.completed,
    // Another tab may have reset or completed this review. It is still a valid task.
    current:
      current?.kind === 'review' &&
      !reviews.some(
        (entry) =>
          referenceKey(entry) === referenceKey(current.reference) &&
          entry.step === current.step &&
          entry.dueAfter === 0,
      )
        ? { kind: 'random', reference: current.reference }
        : current,
    draws: current ? Math.max(1, state.draws) : state.draws,
  });
}

/** One journal commits counters and scheduling together, including in exports. */
export function saveStreamProgress(
  store: LocalStore,
  state: StreamState,
  result: StreamOutcome,
  taskNumber: NonNullable<StreamState['current']>['reference']['taskNumber'],
  now: string,
) {
  const areas = store.snapshot();
  const evaluated =
    result.kind === 'automatic' ||
    (result.kind === 'practice' && result.score !== null);
  const streak =
    result.kind === 'automatic'
      ? result.correct
        ? areas.streamStats.streak + 1
        : 0
      : areas.streamStats.streak;
  store.replace({
    ...areas,
    streamStats: {
      version: 1,
      completed: state.completed,
      streak,
      entries: state.statistics.map((row) => ({
        taskNumber: row.taskNumber,
        attempts: row.automatic.attempts,
        correct: row.automatic.correct,
        self: row.self,
        aiAccepted: row.aiAccepted,
        lastActivity:
          evaluated && row.taskNumber === taskNumber
            ? now
            : (areas.streamStats.entries.find(
                (entry) => entry.taskNumber === row.taskNumber,
              )?.lastActivity ?? now),
      })),
    },
    reviewQueue: { version: 1, entries: state.reviews },
  });
}

/** Called synchronously at acceptance, before navigating away or reloading. */
export function recordStoredResult(
  store: LocalStore,
  state: StreamState,
  result: StreamOutcome,
  now: string,
) {
  if (result.kind === 'format-error')
    return withStreamProgress(state, store.snapshot());
  store.refresh();
  const active = withStreamProgress(state, store.snapshot());
  if (!active.current) throw new TypeError('Сначала выбери задание.');
  const completed = recordStreamResult(active, result);
  saveStreamProgress(
    store,
    completed,
    result,
    active.current.reference.taskNumber,
    now,
  );
  return completed;
}

export function progressTotals(stats: Areas['streamStats']) {
  const automatic = stats.entries.filter((row) => row.taskNumber <= 12);
  const attempts = automatic.reduce((sum, row) => sum + row.attempts, 0);
  const correct = automatic.reduce((sum, row) => sum + row.correct, 0);
  return {
    attempts,
    correct,
    accuracy: attempts ? correct / attempts : null,
    self: stats.entries.reduce((sum, row) => sum + row.self.attempts, 0),
    aiAccepted: stats.entries.reduce(
      (sum, row) => sum + row.aiAccepted.attempts,
      0,
    ),
  };
}
