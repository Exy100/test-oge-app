import { describe, expect, test } from 'vitest';
import { hashSeed, Rng } from './rng';

describe('stable algorithm vectors', () => {
  test.each([
    [
      '',
      2166136261,
      [2625274932, 2119670693, 3324411561, 1770755366, 3488654967, 245707362],
    ],
    [
      'a',
      723832900,
      [365059299, 4014784256, 356113850, 3738744634, 88432160, 4213274528],
    ],
    [
      'abc',
      2921240957,
      [2573219627, 2096477651, 452328767, 2394396848, 2093206060, 1301628859],
    ],
    [
      'Информатика 🧮',
      3510677289,
      [3377082609, 2781940954, 775943752, 293912574, 2839398438, 3650069073],
    ],
  ] as const)(
    '%s matches independent UTF-16LE/uint32 reference vectors',
    (seed, hash, vector) => {
      expect(hashSeed(seed)).toBe(hash);
      const rng = new Rng(seed);
      expect(vector.map(() => rng.int(0, 0xffff_ffff))).toEqual(vector);
    },
  );
  test('Unicode is neither normalised nor replaced implicitly', () => {
    expect(hashSeed('é')).not.toBe(hashSeed('e\u0301'));
    expect(hashSeed('\ud800')).not.toBe(hashSeed('\ufffd'));
  });
});

test('same seed repeats mixed operations; other seeds change the sequence', () => {
  const sequence = (seed: string) => {
    const rng = new Rng(seed);
    return Array.from({ length: 1000 }, () => [
      rng.int(-17, 29),
      rng.chance(0.3),
      rng.pick(['a', 'b', 'c']),
    ]);
  };
  expect(sequence('задача')).toEqual(sequence('задача'));
  expect(sequence('задача')).not.toEqual(sequence('задача-2'));
});

test.each([
  [2, 1],
  [0.5, 2],
  [0, NaN],
  [-Infinity, 0],
  [0, Infinity],
  [0, 0x1_0000_0000],
  [Number.MIN_SAFE_INTEGER - 1, 0],
  [0, Number.MAX_SAFE_INTEGER + 1],
])(
  'rejects invalid integer interval %s…%s without consuming state',
  (min, max) => {
    const rng = new Rng('validation');
    expect(() => rng.int(min, max)).toThrow(RangeError);
    expect(rng.int(0, 1000)).toBe(new Rng('validation').int(0, 1000));
  },
);

test('integer endpoints, safe extremes and negative zero', () => {
  const rng = new Rng('edges');
  expect(Object.is(rng.int(-0, 0), -0)).toBe(false);
  expect(rng.int(9, 9)).toBe(9);
  expect(rng.int(0, 1000)).toBe(new Rng('edges').int(0, 1000));
  for (const min of [
    Number.MIN_SAFE_INTEGER,
    -11,
    Number.MAX_SAFE_INTEGER - 10,
  ]) {
    const values = new Set(
      Array.from({ length: 1000 }, () => rng.int(min, min + 10)),
    );
    expect(values.size).toBe(11);
    expect(
      [...values].every(
        (value) =>
          Number.isSafeInteger(value) && value >= min && value <= min + 10,
      ),
    ).toBe(true);
  }
});

test('wide intervals reject excess uint32 values instead of modulo bias', () => {
  const raw = new Rng('rejection');
  const target = new Rng('rejection');
  const accepted: number[] = [];
  let rejected = 0;
  while (accepted.length < 100) {
    const value = raw.int(0, 0xffff_ffff);
    if (value <= 0x8000_0000) accepted.push(value);
    else rejected += 1;
  }
  expect(rejected).toBeGreaterThan(0);
  expect(accepted.map(() => target.int(0, 0x8000_0000))).toEqual(accepted);
});

test('chi-square: 100,000 integers, ten equal bins (df=9, alpha=.001)', () => {
  const rng = new Rng('chi-square-v1');
  const counts = new Map<number, number>();
  for (let index = 0; index < 100_000; index += 1) {
    const value = rng.int(0, 9);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  expect(counts.size).toBe(10);
  const chiSquare = [...counts.values()].reduce(
    (sum, count) => sum + (count - 10_000) ** 2 / 10_000,
    0,
  );
  expect(chiSquare).toBeLessThan(27.877);
});

test('pick supports readonly values and undefined, but rejects empty input', () => {
  const rng = new Rng('pick');
  expect(() => rng.pick([])).toThrow(RangeError);
  const picked = rng.pick<string | undefined>([undefined]);
  expect(picked).toBeUndefined();
  const item = Object.freeze({ id: 1 });
  expect(rng.pick([item])).toBe(item);
  const choices = Object.freeze(['a', 'b', 'c']);
  expect(new Set(Array.from({ length: 100 }, () => rng.pick(choices)))).toEqual(
    new Set(choices),
  );
});

test('shuffle preserves the input, multiplicities and object identities', () => {
  const item = Object.freeze({ id: 1 });
  const original = Object.freeze([item, item, null, undefined, 'a']);
  const result = new Rng('shuffle').shuffle(original);
  expect(result).not.toBe(original);
  expect(result.filter((value) => value === item)).toHaveLength(2);
  expect(result).toHaveLength(original.length);
  expect(result).toContain(null);
  expect(result).toContain(undefined);
  expect(result).toContain('a');
  expect(new Rng('shuffle').shuffle(original)).toEqual(result);
  expect(new Rng('empty').shuffle([])).toEqual([]);
  const permutations = new Set(
    Array.from({ length: 100 }, (_, index) =>
      new Rng(String(index)).shuffle([0, 1, 2]).join(''),
    ),
  );
  expect(permutations.size).toBe(6);
});

test.each([-1, 1.1, NaN, Infinity])('rejects probability %s', (probability) => {
  expect(() => new Rng('chance').chance(probability)).toThrow(RangeError);
});
test('chance endpoints preserve state; probability .25 has the expected frequency', () => {
  const rng = new Rng('chance');
  expect(rng.chance(0)).toBe(false);
  expect(rng.chance(1)).toBe(true);
  expect(rng.int(0, 1000)).toBe(new Rng('chance').int(0, 1000));
  let successes = 0;
  for (let index = 0; index < 100_000; index += 1)
    if (rng.chance(0.25)) successes += 1;
  expect(Math.abs(successes - 25_000)).toBeLessThan(750);
});

test.each(
  [[], [0], [-1, 2], [NaN], [Infinity]].map((weights) => ({ weights })),
)('rejects invalid weights $weights', ({ weights }) => {
  const rng = new Rng('weights');
  expect(() =>
    rng.weighted(weights.map((weight) => ({ value: 'x', weight }))),
  ).toThrow(RangeError);
  expect(rng.int(0, 1000)).toBe(new Rng('weights').int(0, 1000));
});
test('weights 1:3:6 produce proportional results and never pick zero', () => {
  const rng = new Rng('weighted-distribution');
  const counts = new Map<number, number>();
  for (let index = 0; index < 100_000; index += 1) {
    const value = rng.weighted([
      { value: 0, weight: 0 },
      { value: 1, weight: 0.1 },
      { value: 3, weight: 0.3 },
      { value: 6, weight: 0.6 },
    ]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  expect(counts.has(0)).toBe(false);
  const chiSquare = [1, 3, 6].reduce(
    (sum, value) =>
      sum + ((counts.get(value) ?? 0) - value * 10_000) ** 2 / (value * 10_000),
    0,
  );
  expect(chiSquare).toBeLessThan(13.816);
});
test('large finite weights do not overflow the total', () => {
  const rng = new Rng('large-weights');
  expect(
    new Set(
      Array.from({ length: 100 }, () =>
        rng.weighted([
          { value: undefined, weight: Number.MAX_VALUE },
          { value: 'b', weight: Number.MAX_VALUE },
          { value: 'zero', weight: 0 },
        ]),
      ),
    ),
  ).toEqual(new Set([undefined, 'b']));
});

test('fork is repeatable, independent of parent draws and does not consume them', () => {
  const parent = new Rng('parent');
  const child = parent.fork('condition');
  const first = child.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(parent.int(0, 1000)).toBe(new Rng('parent').int(0, 1000));
  for (let index = 0; index < 100; index += 1) parent.int(0, 100);
  expect(parent.fork('condition').shuffle([0, 1, 2, 3, 4, 5, 6, 7])).toEqual(
    first,
  );
  expect(parent.fork('figure').shuffle([0, 1, 2, 3, 4, 5, 6, 7])).not.toEqual(
    first,
  );
  expect(new Rng('a').fork('b/c').int(0, 0xffff_ffff)).not.toBe(
    new Rng('a/b').fork('c').int(0, 0xffff_ffff),
  );
});
