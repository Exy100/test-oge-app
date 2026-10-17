import { createStreamSession, nextStreamTask } from '../core/stream';
import { streamSources } from '../core/stream/catalog';

export const initialStreamSeed = 'public-practice-start-v1';
export function initialStreamState() {
  return nextStreamTask(
    createStreamSession(initialStreamSeed, { sources: streamSources() }),
  );
}
