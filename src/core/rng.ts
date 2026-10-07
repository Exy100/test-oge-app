/** Versioned algorithm: changing it changes the tasks reproduced by a seed. */
export const RNG_VERSION = 'fnv1a-utf16le-mulberry32-v1';
const UINT32_RANGE = 0x1_0000_0000;

/** FNV-1a over UTF-16LE bytes, including unpaired UTF-16 surrogates. */
export function hashSeed(seed: string): number {
  if (typeof seed !== 'string')
    throw new TypeError('Seed должен быть строкой.');
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    hash = Math.imul(hash ^ (unit & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (unit >>> 8), 0x01000193);
  }
  return hash >>> 0;
}

export interface WeightedValue<T> {
  readonly value: T;
  readonly weight: number;
}

function elementAt<T>(items: readonly T[], index: number): T {
  if (!(index in items))
    throw new RangeError('В массиве не должно быть пропусков.');
  return items[index] as T;
}

/** Deterministic educational sampling, not cryptographic randomness. */
export class Rng {
  readonly #seed: string;
  #state: number;

  constructor(seed: string) {
    this.#state = hashSeed(seed);
    this.#seed = seed;
  }

  #uint32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  /** Inclusive safe-integer bounds; at most 2^32 possible results. */
  int(min: number, max: number): number {
    const size = max - min + 1;
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min > max ||
      size > UINT32_RANGE
    )
      throw new RangeError(
        'Нужен целочисленный диапазон размером от 1 до 2^32.',
      );
    if (size === 1) return min === 0 ? 0 : min;
    // Rejection sampling prevents modulo bias when size does not divide 2^32.
    const limit = UINT32_RANGE - (UINT32_RANGE % size);
    let value: number;
    do {
      value = this.#uint32();
    } while (value >= limit);
    const result = min + (value % size);
    return result === 0 ? 0 : result;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0)
      throw new RangeError('Нельзя выбрать из пустого массива.');
    return elementAt(items, this.int(0, items.length - 1));
  }

  /** Fisher–Yates; never mutates the input. */
  shuffle<T>(items: readonly T[]): T[] {
    const result = Array.from(items);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      const value = elementAt(result, index);
      result[index] = elementAt(result, other);
      result[other] = value;
    }
    return result;
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1)
      throw new RangeError('Вероятность должна быть числом от 0 до 1.');
    if (probability === 0 || probability === 1) return probability === 1;
    return this.#uint32() / UINT32_RANGE < probability;
  }

  weighted<T>(items: readonly WeightedValue<T>[]): T {
    let largest = 0;
    for (const item of items) {
      if (!Number.isFinite(item.weight) || item.weight < 0)
        throw new RangeError(
          'Вес должен быть конечным неотрицательным числом.',
        );
      largest = Math.max(largest, item.weight);
    }
    if (largest === 0)
      throw new RangeError('Нужен хотя бы один положительный вес.');
    const total = items.reduce((sum, item) => sum + item.weight / largest, 0);
    let target = (this.#uint32() / UINT32_RANGE) * total;
    let last: WeightedValue<T> | undefined;
    for (const item of items) {
      const weight = item.weight / largest;
      if (weight === 0) continue;
      last = item;
      if (target < weight) return item.value;
      target -= weight;
    }
    // Floating-point subtraction can leave a small residual at the upper edge.
    if (!last) throw new RangeError('Нет представимого положительного веса.');
    return last.value;
  }

  /** A named child depends on the original seed, not the parent's draw count. */
  fork(label: string): Rng {
    if (typeof label !== 'string')
      throw new TypeError('Метка должна быть строкой.');
    return new Rng(JSON.stringify([this.#seed, label]));
  }
}
