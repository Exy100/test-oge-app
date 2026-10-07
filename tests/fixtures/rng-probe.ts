import type { Rng } from '../../src/core/rng';

export function rngProbe(rng: Rng) {
  const counts = Array.from({ length: 256 }, () => rng.int(-100_000, 100_000));
  return {
    counts,
    wide: Array.from({ length: 32 }, () => rng.int(0, 0xffff_ffff)),
    rejection: Array.from({ length: 32 }, () => rng.int(0, 0x8000_0000)),
    shuffled: rng.shuffle(['а', 'б', 'в', 'г', 'д']),
    picked: rng.pick([null, 'данные', 42]),
    weighted: Array.from({ length: 32 }, () =>
      rng.weighted([
        { value: 'zero', weight: 0 },
        { value: 'a', weight: 1 },
        { value: 'b', weight: 3 },
      ]),
    ),
    chances: Array.from({ length: 32 }, () => rng.chance(0.37)),
    child: rng.fork('условие').shuffle([1, 2, 3, 4, 5, 6, 7, 8]),
    nested: rng.fork('рисунок').fork('цвет').int(0, 1000),
  };
}
