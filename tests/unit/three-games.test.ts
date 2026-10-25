import { describe, expect, it } from 'vitest';
import {
  warehouseLevels,
  warehouseLoad,
  checkWarehouse,
  packetLevels,
  packetPaths,
  checkPacket,
  saveGameLevel,
} from '../../src/lib/interactives/games';
import { LocalStore } from '../../src/core/storage/store';
function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error('Отсутствуют данные проверочного сценария.');
  return value;
}

describe('warehouse learning rules', () => {
  for (const level of warehouseLevels) {
    it(`${level.id}: exhaustively accepts exactly feasible loads with a correct calculation`, () => {
      let accepted = 0;
      for (let a = 0; a <= 6; a++)
        for (let b = 0; b <= 6; b++)
          for (let c = 0; c <= 6; c++) {
            const counts = [a, b, c];
            // Independent bit accounting: expand digits by positional weights, then sum each container.
            const bits = level.cargo
              .flatMap((cargo, i) =>
                Array.from(
                  { length: counts[i] ?? 0 },
                  () =>
                    Array.from(cargo.digits.toUpperCase())
                      .reverse()
                      .reduce(
                        (sum, digit, place) =>
                          sum +
                          '0123456789ABCDEF'.indexOf(digit) *
                            cargo.base ** place,
                        0,
                      ) * cargo.bitsPerSymbol,
                ),
              )
              .reduce((sum, n) => sum + n, 0);
            const expected =
              a > 0 &&
              b > 0 &&
              c > 0 &&
              a + b + c >= level.minimum &&
              bits <= level.capacity * 8;
            expect(
              checkWarehouse(level, counts, String(bits), String(bits / 8))
                .correct,
            ).toBe(expected);
            expect(
              checkWarehouse(level, counts, String(bits + 1), String(bits / 8))
                .correct,
            ).toBe(false);
            expect(
              checkWarehouse(level, counts, String(bits), String(bits / 8 + 1))
                .correct,
            ).toBe(false);
            if (expected) accepted++;
          }
      expect(accepted).toBeGreaterThan(0);
    });
  }
  it('rejects malformed selections and does not coerce empty calculations into zero', () => {
    const level = required(warehouseLevels[0]);
    for (const counts of [
      [],
      [1, 1],
      [7, 1, 1],
      [-1, 1, 1],
      [1.5, 1, 1],
      [NaN, 1, 1],
    ])
      expect(() => warehouseLoad(level, counts)).toThrow(RangeError);
    for (const answer of ['', ' ', '352x', '3.52e2'])
      expect(checkWarehouse(level, [2, 1, 1], answer, '44').correct).toBe(
        false,
      );
  });
  it('accepts different valid packings, not one memorized answer', () => {
    const level = required(warehouseLevels[2]);
    expect(checkWarehouse(level, [4, 1, 1], '800', '100').correct).toBe(true);
    expect(checkWarehouse(level, [3, 2, 1], '864', '108').correct).toBe(true);
  });
});

describe('packet learning rules', () => {
  const cases = [
    { sequence: '4627351', path: ['А', 'Б', 'Г', 'Е', 'Ж'], count: 4 },
    { sequence: '3762415', path: ['А', 'В', 'Г', 'Е', 'Ж'], count: 2 },
    { sequence: '1234567', path: ['А', 'В', 'Д', 'Е', 'З'], count: 2 },
  ];
  packetLevels.forEach((level, i) => {
    it(`${level.id}: accepts all allowed paths and rejects jumps, reverse edges and wrong counts`, () => {
      const example = required(cases[i]);
      // Independent bitmask dynamic programming over all vertex subsets, not recursive path traversal.
      const { nodes, edges } = level.graph;
      const states = new Map<string, number>([['1:0', 1]]);
      let total = 0;
      for (let mask = 1; mask < 1 << nodes.length; mask++)
        for (let end = 0; end < nodes.length; end++) {
          const amount = states.get(`${String(mask)}:${String(end)}`) ?? 0;
          if (
            end === nodes.length - 1 &&
            (!level.via || mask & (1 << nodes.indexOf(level.via)))
          )
            total += amount;
          for (const [from, to] of edges) {
            const target = nodes.indexOf(to);
            if (
              from !== nodes[end] ||
              to === level.avoid ||
              mask & (1 << target)
            )
              continue;
            const key = `${String(mask | (1 << target))}:${String(target)}`;
            states.set(key, (states.get(key) ?? 0) + amount);
          }
        }
      expect(total).toBe(example.count);
      expect(packetPaths(level)).toHaveLength(total);
      for (const path of packetPaths(level))
        expect(
          checkPacket(level, example.sequence, path, String(total)).correct,
        ).toBe(true);
      expect(
        checkPacket(level, example.sequence, example.path, String(total))
          .correct,
      ).toBe(true);
      for (const path of [
        [],
        ['А'],
        ['А', required(nodes.at(-1))],
        [...example.path].reverse(),
        ['А', 'Ж', 'Д', required(nodes.at(-1))],
      ])
        expect(
          checkPacket(level, example.sequence, path, String(total)).correct,
        ).toBe(false);
      for (const answer of ['', ' ', String(total + 1), '2.0'])
        expect(
          checkPacket(level, example.sequence, example.path, answer).correct,
        ).toBe(false);
      for (const sequence of ['1111111', '7654321', '', '1234 67'])
        expect(
          checkPacket(level, sequence, example.path, String(total)).correct,
        ).toBe(false);
    });
  });
  it('accepts either order of overlapping URL fragments', () => {
    const level = required(packetLevels[2]),
      example = required(cases[2]);
    expect(checkPacket(level, '1234657', example.path, '2').correct).toBe(true);
    expect(
      checkPacket(level, '1234567', ['А', 'Б', 'Г', 'Е', 'З'], '2').correct,
    ).toBe(false);
    expect(
      checkPacket(level, '1234567', ['А', 'Б', 'Д', 'Ж', 'З'], '2').correct,
    ).toBe(false);
  });
});

it('persists levels across stores without overwriting quiz, completion or other game results', () => {
  const data = new Map<string, string>();
  const port = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const store = new LocalStore(() => port);
  store.write('lessonProgress', {
    version: 1,
    entries: [
      {
        lessonId: 'bits-bytes',
        completed: true,
        quizCorrect: 3,
        quizTotal: 5,
        levels: ['other:one'],
      },
    ],
  });
  saveGameLevel(store, 'bits-bytes', 'bit-warehouse', 'bytes');
  saveGameLevel(store, 'bits-bytes', 'bit-warehouse', 'bytes');
  saveGameLevel(store, 'restore-address', 'packet-route', 'fork');
  const loaded = new LocalStore(() => port).read('lessonProgress');
  expect(loaded.entries.find((row) => row.lessonId === 'bits-bytes')).toEqual({
    lessonId: 'bits-bytes',
    completed: true,
    quizCorrect: 3,
    quizTotal: 5,
    levels: ['other:one', 'bit-warehouse:bytes'],
  });
  expect(
    loaded.entries.find((row) => row.lessonId === 'restore-address')?.levels,
  ).toEqual(['packet-route:fork']);
});
