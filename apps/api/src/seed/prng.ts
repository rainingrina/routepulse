/**
 * Deterministic pseudo-random generator for the seed (mulberry32). Same seed → same sequence,
 * on every machine. Never use Math.random() in the seed or the engines.
 */
export interface Prng {
  next(): number; // [0, 1)
  int(minInclusive: number, maxInclusive: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Integer in [min, max] that is a multiple of `step`. */
  stepped(min: number, max: number, step: number): number;
}

export function createPrng(seed: number): Prng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError('pick from empty list');
      return item;
    },
    stepped: (min, max, step) => min + step * int(0, Math.floor((max - min) / step)),
  };
}
