import { expect, test } from '@playwright/test';
import { runtimeSeeds } from '../fixtures/rng-source';
import { streamProbe } from '../fixtures/stream-probe';

test('adaptive engine, normalized practice, filtered queue and JSON replay match Node', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/variants/');
  const actual = await page.evaluate(async (seeds) => {
    const path = '/test-oge-app/tests/fixtures/stream-probe.ts';
    const { streamProbe } = (await import(
      /* @vite-ignore */ path
    )) as typeof import('../fixtures/stream-probe');
    return seeds.map(streamProbe);
  }, runtimeSeeds);
  expect(actual).toEqual(runtimeSeeds.map(streamProbe));
  for (const session of actual) {
    expect(session.formatUnchanged).toBe(true);
    expect(session.roundTrip).toBe(true);
    expect(session.trace.some((item) => item.kind === 'review')).toBe(true);
    expect(session.completed).toBe(64);
  }
});
