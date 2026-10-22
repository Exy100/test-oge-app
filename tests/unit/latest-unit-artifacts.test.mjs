import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestUnitArtifacts } from '../../scripts/latest-unit-artifacts.mjs';

const artifact = (shard, id, created_at = '2026-10-22T08:28:44Z') => ({
  name: `unit-shard-${String(shard)}`,
  id,
  created_at,
  expired: false,
});
const original = [artifact(1, 101), artifact(2, 300), artifact(3, 103)];

test('CLI emits exactly three IDs for the download-artifact input', () => {
  expect(
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../scripts/latest-unit-artifacts.mjs', import.meta.url),
        ),
      ],
      {
        input: JSON.stringify([{ artifacts: original }]),
        encoding: 'utf8',
      },
    ),
  ).toBe('101,300,103');
});

test('a successful rerun replaces the older failed blob, even with a smaller artifact ID and reversed API order', () => {
  const rerun = artifact(2, 200, '2026-10-22T08:45:05Z');
  for (const artifacts of [
    [rerun, ...original],
    [...original, rerun],
  ])
    expect(latestUnitArtifacts([{ artifacts }])).toEqual([101, 200, 103]);
});
test('all API pages are considered and unrelated reports are ignored', () => {
  expect(
    latestUnitArtifacts([
      { artifacts: original.slice(0, 1) },
      { artifacts: [{ name: 'source-reports' }, ...original.slice(1)] },
    ]),
  ).toEqual([101, 300, 103]);
});
test('missing shards fail instead of accepting partial coverage', () => {
  expect(() => latestUnitArtifacts([{ artifacts: original.slice(1) }])).toThrow(
    /unit-shard-1/u,
  );
});
test('an expired newest report cannot fall back to an older report', () => {
  expect(() =>
    latestUnitArtifacts([
      {
        artifacts: [
          ...original,
          { ...artifact(2, 200, '2026-10-22T08:45:05Z'), expired: true },
        ],
      },
    ]),
  ).toThrow(/unit-shard-2/u);
});
test('invalid IDs, dates and API responses fail closed', () => {
  for (const overrides of [
    { id: -1 },
    { id: '200' },
    { created_at: 'invalid' },
  ])
    expect(() =>
      latestUnitArtifacts([
        { artifacts: [{ ...original[0], ...overrides }, ...original.slice(1)] },
      ]),
    ).toThrow(/метаданные/u);
  expect(() => latestUnitArtifacts({ artifacts: original })).toThrow(/списка/u);
});
test('ambiguous timestamps are rejected instead of choosing arbitrarily', () => {
  expect(() =>
    latestUnitArtifacts([{ artifacts: [...original, artifact(2, 200)] }]),
  ).toThrow(/Неоднозначная/u);
});

test('unique attempt names retain successful shards from earlier attempts', () => {
  const previous = original.map((entry) => ({
    ...entry,
    name: entry.name + '-attempt-1',
  }));
  const rerun = {
    ...artifact(2, 200, '2026-10-22T08:45:05Z'),
    name: 'unit-shard-2-attempt-2',
  };
  expect(latestUnitArtifacts([{ artifacts: [rerun, ...previous] }])).toEqual([
    101, 200, 103,
  ]);
});
